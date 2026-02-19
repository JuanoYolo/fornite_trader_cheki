import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const indexPath = resolve(distDir, "index.html");
const notFoundPath = resolve(distDir, "404.html");

if (!existsSync(indexPath)) {
  throw new Error("dist/index.html does not exist. Build frontend before generating SPA fallback.");
}

copyFileSync(indexPath, notFoundPath);
console.log("Generated dist/404.html for GitHub Pages SPA fallback.");
