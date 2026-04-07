#!/usr/bin/env node
import { ensureDirs, readJson, writeJson, CONFIG, SECRETS } from "../src/paths.mjs";
import { acquireLock } from "../src/lock.mjs";
import { detectRuntime } from "../src/runtime.mjs";
import { findFreePort } from "../src/port.mjs";
import { waitForHealth } from "../src/health.mjs";
import { completeFirstRun } from "../src/setup.mjs";
import { ensureDockerContainer } from "../src/docker.mjs";
import { ensureJar, spawnJar } from "../src/jar.mjs";
import { info, err } from "../src/log.mjs";

function printReady({ baseUrl, creds }) {
  console.log("");
  console.log("================================================================");
  console.log("  Metabase is ready");
  console.log("================================================================");
  console.log(`  URL:      ${baseUrl}`);
  console.log(`  Email:    ${creds.email}`);
  console.log(`  Password: ${creds.password}`);
  console.log("");
  console.log(`  Credentials saved to ~/.metabase-mcpb/secrets.json`);
  console.log("================================================================");
}

async function reuseIfHealthy() {
  const cfg = await readJson(CONFIG);
  if (!cfg?.port) return null;
  const baseUrl = `http://localhost:${cfg.port}`;
  try {
    const r = await fetch(`${baseUrl}/api/health`);
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    if (j.status !== "ok") return null;
  } catch { return null; }
  const creds = await readJson(SECRETS);
  if (!creds) return null;
  return { baseUrl, creds };
}

async function main() {
  await ensureDirs();
  const release = await acquireLock();
  try {
    const reused = await reuseIfHealthy();
    if (reused) {
      info("Existing Metabase instance is healthy.");
      printReady(reused);
      return;
    }

    const runtime = detectRuntime();
    info(`Selected runtime: ${runtime}`);

    const port = await findFreePort(3000, 3100);
    info(`Using port ${port}`);

    let cfg = { port, runtime };

    if (runtime === "docker") {
      const c = ensureDockerContainer({ port });
      cfg = { ...cfg, containerName: c.name, image: c.image, volume: c.volume };
    } else {
      await ensureJar();
      const { pid } = await spawnJar({ port });
      cfg = { ...cfg, pid };
    }

    await writeJson(CONFIG, cfg);

    const baseUrl = `http://localhost:${port}`;
    info(`Waiting for Metabase to come up at ${baseUrl} ...`);
    await waitForHealth(baseUrl);

    const creds = await completeFirstRun(baseUrl);
    printReady({ baseUrl, creds });
  } finally {
    await release();
  }
}

main().catch((e) => {
  err(e.message || String(e));
  process.exit(1);
});
