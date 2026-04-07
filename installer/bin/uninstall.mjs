#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readJson, CONFIG, PIDFILE, ROOT } from "../src/paths.mjs";
import { rm, readFile } from "node:fs/promises";
import { info, warn } from "../src/log.mjs";

const wipe = process.argv.includes("--wipe");

async function main() {
  const cfg = await readJson(CONFIG);
  if (!cfg) {
    info("No config found; nothing to stop.");
  } else if (cfg.runtime === "docker") {
    info(`Stopping container ${cfg.containerName} ...`);
    spawnSync("docker", ["rm", "-f", cfg.containerName], { stdio: "inherit" });
  } else if (cfg.runtime === "jar") {
    try {
      const pid = parseInt(await readFile(PIDFILE, "utf8"), 10);
      if (pid) { info(`Killing pid ${pid} ...`); try { process.kill(pid); } catch {} }
    } catch {}
  }
  if (wipe) {
    warn(`Wiping ${ROOT} ...`);
    await rm(ROOT, { recursive: true, force: true });
  } else {
    info(`Data dir preserved at ${ROOT}. Pass --wipe to delete it.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
