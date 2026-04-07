import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "", err: r.error };
}

export function dockerAvailable() {
  const r = run("docker", ["info"]);
  return r.code === 0;
}

export function javaMajorVersion() {
  // `java -version` writes to stderr
  const r = run("java", ["-version"]);
  if (r.err || r.code !== 0) return null;
  const out = r.stderr || r.stdout;
  // Examples: "openjdk version \"21.0.2\"", "java version \"1.8.0_292\""
  const m = out.match(/version "([^"]+)"/);
  if (!m) return null;
  const v = m[1];
  if (v.startsWith("1.")) return parseInt(v.split(".")[1], 10); // 1.8 → 8
  return parseInt(v.split(".")[0], 10);
}

export function detectRuntime() {
  if (dockerAvailable()) return "docker";
  const jv = javaMajorVersion();
  if (jv !== null && jv >= 21) return "jar";
  const lines = [
    "Could not find a usable runtime for Metabase.",
    "",
    "Please install one of:",
    "  • Docker Desktop  → https://www.docker.com/products/docker-desktop/",
    "  • Java 21+        → https://adoptium.net/temurin/releases/?version=21",
    "",
    jv !== null ? `(Detected Java ${jv}, but Metabase requires Java 21 or newer.)` : "",
  ].filter(Boolean).join("\n");
  const e = new Error(lines);
  e.code = "NO_RUNTIME";
  throw e;
}
