import { spawnSync } from "child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packDir = resolve(packageDir, ".pack");

rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir);

// Packs a local tarball only. This script never publishes.
const result = spawnSync("npm", ["pack", "--pack-destination", packDir], {
  cwd: packageDir,
  stdio: "inherit",
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Stable name for consumers that install the tarball (host-app).
const { version } = JSON.parse(
  readFileSync(resolve(packageDir, "package.json"), "utf8"),
);
copyFileSync(
  resolve(packDir, `metabase-ui-${version}.tgz`),
  resolve(packDir, "metabase-ui.tgz"),
);
