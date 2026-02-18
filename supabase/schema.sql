-- =============================================
-- Fortnite Coins Market — Supabase Schema + Seed
-- Run this in Supabase SQL Editor
-- =============================================

-- Tables
CREATE TABLE IF NOT EXISTS rooms (
  room_code TEXT PRIMARY KEY,
  spread_bps INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coins (
  coin_symbol TEXT PRIMARY KEY,
  player_label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL REFERENCES rooms(room_code),
  player_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  pin TEXT NOT NULL,
  cash NUMERIC NOT NULL DEFAULT 100000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_code, display_name)
);

CREATE TABLE IF NOT EXISTS holdings (
  room_code TEXT NOT NULL,
  player_id UUID NOT NULL REFERENCES room_players(id),
  coin_symbol TEXT NOT NULL REFERENCES coins(coin_symbol),
  qty NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (room_code, player_id, coin_symbol)
);

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

CREATE TABLE IF NOT EXISTS prices (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL,
  coin_symbol TEXT NOT NULL REFERENCES coins(coin_symbol),
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prices_room_coin_time ON prices(room_code, coin_symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_room_coin_time ON trades(room_code, coin_symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_code);

-- Seed: Coins
INSERT INTO coins (coin_symbol, player_label) VALUES
  ('JUANO', 'Juano'),
  ('ZOM', 'Zomheld'),
  ('CRIS', 'Cristofprime')
ON CONFLICT DO NOTHING;

-- Seed: Default Room
INSERT INTO rooms (room_code, spread_bps) VALUES ('JUANO-ROOM', 50)
ON CONFLICT DO NOTHING;

-- Seed: Initial Prices
INSERT INTO prices (room_code, coin_symbol, price) VALUES
  ('JUANO-ROOM', 'JUANO', 50000),
  ('JUANO-ROOM', 'ZOM', 60000),
  ('JUANO-ROOM', 'CRIS', 55000);

-- Seed: Test Players
INSERT INTO room_players (room_code, player_code, display_name, pin, cash) VALUES
  ('JUANO-ROOM', 'JUANO-P1', 'JuanoYoloXd', '1111', 100000),
  ('JUANO-ROOM', 'JUANO-P2', 'ZomHeldD', '2222', 100000),
  ('JUANO-ROOM', 'JUANO-P3', 'Cristofprime', '3333', 100000)
ON CONFLICT DO NOTHING;

-- Seed: Initial Holdings (0 for each coin for each player)
DO $$
DECLARE
  p RECORD;
  c RECORD;
BEGIN
  FOR p IN SELECT id, room_code FROM room_players WHERE room_code = 'JUANO-ROOM' LOOP
    FOR c IN SELECT coin_symbol FROM coins LOOP
      INSERT INTO holdings (room_code, player_id, coin_symbol, qty)
      VALUES (p.room_code, p.id, c.coin_symbol, 0)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- =============================================
-- RPC: Atomic Trade Function
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_trade(
  p_room_code TEXT,
  p_player_code TEXT,
  p_side TEXT,       -- 'buy' or 'sell'
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
  v_cost NUMERIC;
  v_current_qty NUMERIC;
  v_impact NUMERIC;
  v_new_mid NUMERIC;
BEGIN
  -- Get player
  SELECT id, cash INTO v_player_id, v_cash
  FROM room_players
  WHERE room_code = p_room_code AND player_code = p_player_code
  FOR UPDATE;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  -- Get spread
  SELECT spread_bps INTO v_spread_bps FROM rooms WHERE room_code = p_room_code;
  v_spread := v_spread_bps::NUMERIC / 10000;

  -- Get latest mid price
  SELECT price INTO v_mid
  FROM prices
  WHERE room_code = p_room_code AND coin_symbol = p_coin_symbol
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_mid IS NULL THEN
    RAISE EXCEPTION 'No price data for coin';
  END IF;

  -- Get current holding
  SELECT qty INTO v_current_qty
  FROM holdings
  WHERE room_code = p_room_code AND player_id = v_player_id AND coin_symbol = p_coin_symbol
  FOR UPDATE;

  IF v_current_qty IS NULL THEN
    v_current_qty := 0;
  END IF;

  IF p_side = 'buy' THEN
    v_exec_price := v_mid * (1 + v_spread);
    v_cost := v_exec_price * p_qty;
    IF v_cost > v_cash THEN
      RAISE EXCEPTION 'Insufficient cash. Need %, have %', round(v_cost, 2), round(v_cash, 2);
    END IF;

    -- Deduct cash, add holdings
    UPDATE room_players SET cash = cash - v_cost WHERE id = v_player_id;
    INSERT INTO holdings (room_code, player_id, coin_symbol, qty)
    VALUES (p_room_code, v_player_id, p_coin_symbol, p_qty)
    ON CONFLICT (room_code, player_id, coin_symbol)
    DO UPDATE SET qty = holdings.qty + p_qty;

  ELSIF p_side = 'sell' THEN
    IF p_qty > v_current_qty THEN
      RAISE EXCEPTION 'Insufficient holdings. Have %, selling %', v_current_qty, p_qty;
    END IF;
    v_exec_price := v_mid * (1 - v_spread);
    v_cost := v_exec_price * p_qty;

    -- Add cash, remove holdings
    UPDATE room_players SET cash = cash + v_cost WHERE id = v_player_id;
    UPDATE holdings SET qty = qty - p_qty
    WHERE room_code = p_room_code AND player_id = v_player_id AND coin_symbol = p_coin_symbol;
  ELSE
    RAISE EXCEPTION 'Invalid side: %', p_side;
  END IF;

  -- Insert trade record
  INSERT INTO trades (room_code, player_id, coin_symbol, side, qty, price, spread_bps)
  VALUES (p_room_code, v_player_id, p_coin_symbol, p_side, p_qty, v_exec_price, v_spread_bps);

  -- Price impact
  v_impact := LEAST(0.02, p_qty * 0.0002);
  IF p_side = 'buy' THEN
    v_new_mid := v_mid * (1 + v_impact);
  ELSE
    v_new_mid := GREATEST(1, v_mid * (1 - v_impact));
  END IF;

  INSERT INTO prices (room_code, coin_symbol, price)
  VALUES (p_room_code, p_coin_symbol, v_new_mid);

  -- Get updated values
  SELECT cash INTO v_cash FROM room_players WHERE id = v_player_id;
  SELECT qty INTO v_current_qty
  FROM holdings
  WHERE room_code = p_room_code AND player_id = v_player_id AND coin_symbol = p_coin_symbol;

  RETURN json_build_object(
    'exec_price', round(v_exec_price, 2),
    'new_mid', round(v_new_mid, 2),
    'cash', round(v_cash, 2),
    'holding_qty', v_current_qty
  );
END;
$$;
