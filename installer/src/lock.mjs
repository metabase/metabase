import { open, unlink, readFile } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import { LOCKFILE } from "./paths.mjs";

function isProcessRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function acquireLock() {
  try {
    const fh = await open(LOCKFILE, "wx");
    await fh.write(String(process.pid));
    await fh.close();
  } catch (e) {
    if (e.code === "EEXIST") {
      // Check if the process that holds the lock is still alive
      try {
        const contents = await readFile(LOCKFILE, "utf8");
        const pid = parseInt(contents.trim(), 10);
        if (pid && !isProcessRunning(pid)) {
          // Stale lock from a crashed installer — remove and retry
          await unlink(LOCKFILE);
          const fh = await open(LOCKFILE, "wx");
          await fh.write(String(process.pid));
          await fh.close();
          // fall through to set up release handlers below
        } else {
          throw new Error(`Another installer run is in progress (pid ${pid}, lock: ${LOCKFILE}).`);
        }
      } catch (inner) {
        if (inner.code === "EEXIST") {
          // Race: another process grabbed the lock between our unlink and open
          throw new Error(`Another installer run is in progress (lock: ${LOCKFILE}).`);
        }
        if (inner.message?.includes("Another installer")) throw inner;
        throw new Error(`Another installer run is in progress (lock: ${LOCKFILE}). If not, delete it and retry.`);
      }
    } else {
      throw e;
    }
  }
  const release = async () => { try { await unlink(LOCKFILE); } catch {} };
  process.on("exit", () => { try { unlinkSync(LOCKFILE); } catch {} });
  return release;
}
