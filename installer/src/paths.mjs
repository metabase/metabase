import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, chmod, stat } from "node:fs/promises";

export const ROOT       = join(homedir(), ".metabase-mcpb");
export const JARS_DIR   = join(ROOT, "jars");
export const H2_DIR     = join(ROOT, "h2");
export const LOGS_DIR   = join(ROOT, "logs");
export const CONFIG     = join(ROOT, "config.json");
export const SECRETS    = join(ROOT, "secrets.json");
export const PIDFILE    = join(ROOT, "metabase.pid");
export const LOCKFILE   = join(ROOT, ".lock");
export const JAR_PATH   = join(JARS_DIR, "metabase.jar");
export const LOG_FILE   = join(LOGS_DIR, "metabase.log");

export async function ensureDirs() {
  for (const d of [ROOT, JARS_DIR, H2_DIR, LOGS_DIR]) {
    await mkdir(d, { recursive: true });
  }
}

export async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

export async function writeJson(path, data, { secret = false } = {}) {
  await writeFile(path, JSON.stringify(data, null, 2));
  if (secret) await chmod(path, 0o600);
}

export async function fileExists(path) {
  try { await stat(path); return true; } catch { return false; }
}
