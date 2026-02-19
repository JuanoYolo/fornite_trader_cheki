-- Fortnite Coins Market - schema + seed + transactional RPC
-- Run once in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- MVP mode: RLS disabled for server-to-server access from Worker service role.

CREATE TABLE IF NOT EXISTS rooms (
  room_code TEXT PRIMARY KEY,
  spread_bps INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS coins (
  coin_symbol TEXT PRIMARY KEY,
  player_label TEXT NOT NULL
);
ALTER TABLE coins DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL REFERENCES rooms(room_code),
  player_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  pin TEXT NOT NULL,
  cash NUMERIC NOT NULL DEFAULT 100000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_code, display_name)
);
ALTER TABLE room_players DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS holdings (
  room_code TEXT NOT NULL,
  player_id UUID NOT NULL REFERENCES room_players(id),
  coin_symbol TEXT NOT NULL REFERENCES coins(coin_symbol),
  qty NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (room_code, player_id, coin_symbol)
);
ALTER TABLE holdings DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL,
  player_id UUID NOT NULL REFERENCES room_players(id),
  coin_symbol TEXT NOT NULL REFERENCES coins(coin_symbol),
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  qty NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  spread_bps INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE trades DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS prices (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL,
  coin_symbol TEXT NOT NULL REFERENCES coins(coin_symbol),
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE prices DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prices_room_coin_time ON prices (room_code, coin_symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_room_coin_time ON trades (room_code, coin_symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players (room_code);

-- Seed
INSERT INTO coins (coin_symbol, player_label)
VALUES
  ('JUANO', 'Juano'),
  ('ZOM', 'Zomheld'),
  ('CRIS', 'Cristofprime')
ON CONFLICT (coin_symbol) DO UPDATE SET player_label = EXCLUDED.player_label;

INSERT INTO rooms (room_code, spread_bps)
VALUES ('JUANO-ROOM', 50)
ON CONFLICT (room_code) DO UPDATE SET spread_bps = EXCLUDED.spread_bps;

INSERT INTO prices (room_code, coin_symbol, price)
SELECT x.room_code, x.coin_symbol, x.price
FROM (
  VALUES
    ('JUANO-ROOM', 'JUANO', 50000::NUMERIC),
    ('JUANO-ROOM', 'ZOM', 60000::NUMERIC),
    ('JUANO-ROOM', 'CRIS', 55000::NUMERIC)
) AS x(room_code, coin_symbol, price)
WHERE NOT EXISTS (
  SELECT 1 FROM prices p WHERE p.room_code = x.room_code AND p.coin_symbol = x.coin_symbol
);

INSERT INTO room_players (room_code, player_code, display_name, pin, cash)
VALUES
  ('JUANO-ROOM', 'JUANO-P1', 'JuanoYoloXd', '1111', 100000),
  ('JUANO-ROOM', 'JUANO-P2', 'ZomHeldD', '2222', 100000),
  ('JUANO-ROOM', 'JUANO-P3', 'Cristofprime', '3333', 100000)
ON CONFLICT (player_code) DO NOTHING;

DO $$
DECLARE
  p RECORD;
  c RECORD;
BEGIN
  FOR p IN SELECT id, room_code FROM room_players WHERE room_code = 'JUANO-ROOM' LOOP
    FOR c IN SELECT coin_symbol FROM coins LOOP
      INSERT INTO holdings (room_code, player_id, coin_symbol, qty)
      VALUES (p.room_code, p.id, c.coin_symbol, 0)
      ON CONFLICT (room_code, player_id, coin_symbol) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_trade(
  p_room_code TEXT,
  p_player_code TEXT,
  p_side TEXT,
  p_coin_symbol TEXT,
  p_qty NUMERIC
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player_id UUID;
  v_cash NUMERIC;
  v_mid NUMERIC;
  v_spread_bps INTEGER;
  v_spread NUMERIC;
  v_exec_price NUMERIC;
  v_notional NUMERIC;
  v_current_qty NUMERIC;
  v_impact NUMERIC;
  v_new_mid NUMERIC;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF p_side NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'Invalid side: %', p_side;
  END IF;

  PERFORM 1 FROM coins WHERE coin_symbol = p_coin_symbol;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coin not found: %', p_coin_symbol;
  END IF;

  SELECT id, cash INTO v_player_id, v_cash
  FROM room_players
  WHERE room_code = p_room_code AND player_code = p_player_code
  FOR UPDATE;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  SELECT spread_bps INTO v_spread_bps FROM rooms WHERE room_code = p_room_code;
  IF v_spread_bps IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;
  v_spread := v_spread_bps::NUMERIC / 10000;

  SELECT price INTO v_mid
  FROM prices
  WHERE room_code = p_room_code AND coin_symbol = p_coin_symbol
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_mid IS NULL THEN
    RAISE EXCEPTION 'No price data for coin';
  END IF;

  SELECT qty INTO v_current_qty
  FROM holdings
  WHERE room_code = p_room_code AND player_id = v_player_id AND coin_symbol = p_coin_symbol
  FOR UPDATE;

  IF v_current_qty IS NULL THEN
    v_current_qty := 0;
  END IF;

  IF p_side = 'buy' THEN
    v_exec_price := v_mid * (1 + v_spread);
    v_notional := v_exec_price * p_qty;

    IF v_notional > v_cash THEN
      RAISE EXCEPTION 'Insufficient cash. Need %, have %', round(v_notional, 2), round(v_cash, 2);
    END IF;

    UPDATE room_players SET cash = cash - v_notional WHERE id = v_player_id;
    INSERT INTO holdings (room_code, player_id, coin_symbol, qty)
    VALUES (p_room_code, v_player_id, p_coin_symbol, p_qty)
    ON CONFLICT (room_code, player_id, coin_symbol)
    DO UPDATE SET qty = holdings.qty + EXCLUDED.qty;
  ELSE
    IF p_qty > v_current_qty THEN
      RAISE EXCEPTION 'Insufficient holdings. Have %, selling %', v_current_qty, p_qty;
    END IF;

    v_exec_price := v_mid * (1 - v_spread);
    v_notional := v_exec_price * p_qty;

    UPDATE room_players SET cash = cash + v_notional WHERE id = v_player_id;
    UPDATE holdings
    SET qty = qty - p_qty
    WHERE room_code = p_room_code AND player_id = v_player_id AND coin_symbol = p_coin_symbol;
  END IF;

  INSERT INTO trades (room_code, player_id, coin_symbol, side, qty, price, spread_bps)
  VALUES (p_room_code, v_player_id, p_coin_symbol, p_side, p_qty, v_exec_price, v_spread_bps);

  v_impact := LEAST(0.02, p_qty * 0.0002);
  IF p_side = 'buy' THEN
    v_new_mid := v_mid * (1 + v_impact);
  ELSE
    v_new_mid := GREATEST(1, v_mid * (1 - v_impact));
  END IF;

  INSERT INTO prices (room_code, coin_symbol, price)
  VALUES (p_room_code, p_coin_symbol, v_new_mid);

  SELECT cash INTO v_cash FROM room_players WHERE id = v_player_id;
  SELECT qty INTO v_current_qty
  FROM holdings
  WHERE room_code = p_room_code AND player_id = v_player_id AND coin_symbol = p_coin_symbol;

  RETURN json_build_object(
    'exec_price', round(v_exec_price, 2),
    'new_mid', round(v_new_mid, 2),
    'cash', round(v_cash, 2),
    'holding_qty', COALESCE(v_current_qty, 0)
  );
END;
$$;
