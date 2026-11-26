import { spawnSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { resolve } from "path";

const packageDir = resolve(import.meta.dirname, "..");
const packDir = resolve(packageDir, ".pack");

rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir);

// Packs a local tarball only. This script never publishes.
const result = spawnSync("bun", ["pm", "pack", "--destination", packDir], {
  cwd: packageDir,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
