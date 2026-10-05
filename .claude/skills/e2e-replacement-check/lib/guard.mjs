import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { porcelain } from "./git.mjs";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// Applies one break at a time to the working tree and puts the files back.
// Each original file is copied into the state directory and listed in a marker before the break is written,
// so the next run can restore the files when a run is killed with a break applied.
export function createGuard({ root, stateDir }) {
  const markerPath = path.join(stateDir, "applied.json");
  let current = null;

  function writeMarker(marker) {
    fs.mkdirSync(stateDir, { recursive: true });
    const tmp = `${markerPath}.tmp`;
    const fd = fs.openSync(tmp, "w");
    fs.writeSync(fd, JSON.stringify(marker, null, 1));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmp, markerPath);
  }

  function clearState(files) {
    for (const f of files) {
      fs.rmSync(path.join(stateDir, f.backup), { force: true });
    }
    fs.rmSync(markerPath, { force: true });
  }

  function restoreFromMarker(marker) {
    const restored = [];
    for (const f of marker.files) {
      const original = fs.readFileSync(path.join(stateDir, f.backup));
      if (sha256(original) !== f.sha256) {
        throw new Error(`the saved copy of ${f.file} in ${stateDir} is damaged; restore it with git checkout -- ${f.file}`);
      }
      fs.writeFileSync(path.join(root, f.file), original);
      restored.push(f.file);
    }
    clearState(marker.files);
    return restored;
  }

  function readMarker() {
    return fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, "utf8")) : null;
  }

  return {
    markerPath,

    applied: () => current !== null,

    recoverLeftover() {
      const marker = readMarker();
      if (!marker) {
        return [];
      }
      if (marker.pid !== process.pid && pidAlive(marker.pid)) {
        throw new Error(`another run (pid ${marker.pid}) has a break applied in this checkout; wait for it to finish or stop it`);
      }
      return restoreFromMarker(marker);
    },

    apply(changes) {
      if (current) {
        throw new Error("a break is already applied");
      }
      const files = changes.map((change, i) => {
        const original = fs.readFileSync(path.join(root, change.file));
        const backup = `backup-${i}`;
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(path.join(stateDir, backup), original);
        return { file: change.file, backup, sha256: sha256(original), original };
      });
      writeMarker({
        pid: process.pid,
        started_at: new Date().toISOString(),
        files: files.map((f) => ({ file: f.file, backup: f.backup, sha256: f.sha256 })),
      });
      current = files;
      for (const change of changes) {
        fs.writeFileSync(path.join(root, change.file), change.after);
      }
    },

    revert() {
      if (!current) {
        const marker = readMarker();
        if (marker && marker.pid === process.pid) {
          restoreFromMarker(marker);
        }
        return;
      }
      for (const f of current) {
        fs.writeFileSync(path.join(root, f.file), f.original);
      }
      for (const f of current) {
        if (sha256(fs.readFileSync(path.join(root, f.file))) !== f.sha256) {
          throw new Error(`${f.file} doesn't match its original after reverting; the saved copy is in ${stateDir}`);
        }
      }
      clearState(current);
      current = null;
    },

    async withBreak(changes, fn) {
      this.apply(changes);
      try {
        return await fn();
      } finally {
        this.revert();
      }
    },
  };
}

// SIGINT and SIGTERM stop the running test process, revert the break and exit.
export function installInterruptHandlers(guard, { children = new Set(), log = console.error } = {}) {
  const onSignal = (signal, code) => () => {
    for (const child of children) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
    try {
      if (guard.applied()) {
        guard.revert();
        log(`\nInterrupted by ${signal}: the break was reverted.`);
      }
    } finally {
      process.exit(code);
    }
  };
  const handlers = { SIGINT: onSignal("SIGINT", 130), SIGTERM: onSignal("SIGTERM", 143) };
  process.on("SIGINT", handlers.SIGINT);
  process.on("SIGTERM", handlers.SIGTERM);
  const onExit = () => {
    if (guard.applied()) {
      guard.revert();
    }
  };
  process.on("exit", onExit);
  return () => {
    process.off("SIGINT", handlers.SIGINT);
    process.off("SIGTERM", handlers.SIGTERM);
    process.off("exit", onExit);
  };
}

export function refuseUncommitted(root, files) {
  const dirty = porcelain(root, files);
  if (dirty.length) {
    throw new Error(
      `these files have uncommitted changes, so the check won't touch them:\n${dirty.join("\n")}\nCommit or stash them, then run again.`,
    );
  }
}
