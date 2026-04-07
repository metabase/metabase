import { open, unlink } from "node:fs/promises";
import { LOCKFILE } from "./paths.mjs";

export async function acquireLock() {
  try {
    const fh = await open(LOCKFILE, "wx");
    await fh.write(String(process.pid));
    await fh.close();
  } catch (e) {
    if (e.code === "EEXIST") {
      throw new Error(`Another installer run is in progress (lock: ${LOCKFILE}). If not, delete it and retry.`);
    }
    throw e;
  }
  const release = async () => { try { await unlink(LOCKFILE); } catch {} };
  process.on("exit", () => { try { require("node:fs").unlinkSync(LOCKFILE); } catch {} });
  return release;
}
