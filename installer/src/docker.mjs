import { spawnSync } from "node:child_process";
import { info, warn } from "./log.mjs";

const NAME   = "metabase-mcpb";
const IMAGE  = "metabase/metabase:latest";
const VOLUME = "metabase-mcpb-data";

function d(args) {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  return { code: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

function containerExists() {
  const r = d(["ps", "-a", "--filter", `name=^${NAME}$`, "--format", "{{.Names}}"]);
  return r.code === 0 && r.stdout === NAME;
}

function removeContainer() {
  d(["rm", "-f", NAME]);
}

export function ensureDockerContainer({ port }) {
  info(`Pulling ${IMAGE} (may be cached) ...`);
  const pull = d(["pull", IMAGE]);
  if (pull.code !== 0) warn(`docker pull failed: ${pull.stderr}`);

  if (containerExists()) {
    info(`Existing container '${NAME}' found — clobbering.`);
    removeContainer();
  }

  // Fresh install path: also clobber any leftover volume from a prior failed
  // run, otherwise we may inherit a corrupt H2 store.
  const volRm = d(["volume", "rm", VOLUME]);
  if (volRm.code === 0) info(`Removed stale volume '${VOLUME}'.`);

  info(`Starting container '${NAME}' on port ${port} ...`);
  const run = d([
    "run", "-d",
    "--name", NAME,
    "-p", `127.0.0.1:${port}:3000`,
    "-v", `${VOLUME}:/metabase.db`,
    IMAGE,
  ]);
  if (run.code !== 0) {
    throw new Error(`docker run failed: ${run.stderr}`);
  }
  return { name: NAME, image: IMAGE, volume: VOLUME };
}
