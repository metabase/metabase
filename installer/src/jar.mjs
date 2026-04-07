import { spawn } from "node:child_process";
import { open, writeFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { JAR_PATH, H2_DIR, LOG_FILE, PIDFILE } from "./paths.mjs";
import { info } from "./log.mjs";

const JAR_URL = "https://downloads.metabase.com/latest/metabase.jar";

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

export async function ensureJar() {
  if (await exists(JAR_PATH)) {
    info(`Using cached jar at ${JAR_PATH}`);
    return;
  }
  info(`Downloading ${JAR_URL} → ${JAR_PATH} ...`);
  const r = await fetch(JAR_URL);
  if (!r.ok || !r.body) throw new Error(`Failed to download metabase.jar: ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(JAR_PATH));
  info("Download complete.");
}

export async function spawnJar({ port }) {
  const out = await open(LOG_FILE, "a");
  const child = spawn("java", ["-jar", JAR_PATH], {
    detached: true,
    stdio: ["ignore", out.fd, out.fd],
    env: {
      ...process.env,
      MB_JETTY_PORT: String(port),
      MB_DB_TYPE: "h2",
      MB_DB_FILE: `${H2_DIR}/metabase.db`,
    },
  });
  child.unref();
  await out.close(); // child inherited the fd; close the parent's copy to avoid leak
  await writeFile(PIDFILE, String(child.pid));
  info(`Spawned Metabase (pid ${child.pid}); logs → ${LOG_FILE}`);
  return { pid: child.pid };
}
