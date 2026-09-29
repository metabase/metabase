/**
 * Reads and zeroes the Istanbul counters (`window.__coverage__`) of the app windows a test runs.
 * With `frames`, it also reads those of their same-origin child frames, nested ones included.
 */

import { addBranchHits } from "./journey-capture-encoding";

const FRAME_TAGS = new Set(["IFRAME", "FRAME"]);

// The capture's Chrome runs without web security, so a cross-origin frame can be readable and only its origin tells it apart.
function sameOriginFrame(frame, origin) {
  try {
    return frame && frame.location.origin === origin ? frame : null;
  } catch {
    return null;
  }
}

export function createCoverageCounters({
  frames = false,
  onError = () => {},
} = {}) {
  // References to the __coverage__ objects of app windows that may still gain
  // counts. Istanbul registers every instrumented chunk into one object per
  // window, so holding the reference sees lazily-loaded files too. A reload
  // creates a fresh object (tracked by the window:load handler); the old
  // one keeps any counts fired earlier in the same test until the flush.
  let objects = [];
  // Per coverage object, the files a cut walks, each with its counts as of the previous cut.
  const fileTables = new WeakMap();
  const watchedDocuments = new WeakSet();

  function add(coverage) {
    if (coverage && !objects.includes(coverage)) {
      objects.push(coverage);
    }
  }

  function readFrame(frame, origin) {
    let children;
    try {
      add(frame.__coverage__);
      children = Array.from({ length: frame.frames.length }, (_, i) =>
        sameOriginFrame(frame.frames[i], origin),
      );
    } catch {
      return;
    }
    watchFrameLoads(frame, origin);
    for (const child of children) {
      if (child) {
        readFrame(child, origin);
      }
    }
  }

  // A frame can load and go away between two reads, so each document also reads its frames as they load.
  // A frame's load event reaches its parent document's capture listeners, but not the parent window's.
  function watchFrameLoads(win, origin) {
    let doc = null;
    try {
      doc = win.document;
    } catch {
      return;
    }
    if (!doc || watchedDocuments.has(doc)) {
      return;
    }
    watchedDocuments.add(doc);
    doc.addEventListener(
      "load",
      (event) => {
        try {
          const element = event.target;
          const frame = FRAME_TAGS.has(element?.tagName)
            ? sameOriginFrame(element.contentWindow, origin)
            : null;
          if (frame) {
            readFrame(frame, origin);
          }
        } catch {
          onError();
        }
      },
      true,
    );
  }

  function track(win) {
    add(win.__coverage__);
    if (frames) {
      let origin = null;
      try {
        origin = win.location.origin;
      } catch {
        return;
      }
      readFrame(win, origin);
    }
  }

  // Sums the per-file function counters across all tracked windows, zeroing
  // every counter (functions, statements, branches) as it goes so the next
  // flush reports only what fired after this one. Dead windows' objects are
  // zeroed and pruned — only the current window and its frames can still gain counts.
  // With `branchHits`, the branch arms that ran are added to it before they are zeroed.
  function collectAndZero(currentWin, branchHits = null) {
    track(currentWin);
    const f = {};
    for (const coverage of objects) {
      for (const [file, fileCov] of Object.entries(coverage)) {
        const fired = fileCov.f || {};
        for (const [idx, count] of Object.entries(fired)) {
          if (count > 0) {
            const fileTotals = (f[file] ??= {});
            fileTotals[idx] = (fileTotals[idx] || 0) + count;
            fired[idx] = 0;
          }
        }
        for (const idx of Object.keys(fileCov.s || {})) {
          fileCov.s[idx] = 0;
        }
        if (branchHits) {
          try {
            addBranchHits(branchHits, file, fileCov.b || {});
          } catch {
            onError();
          }
        }
        for (const counts of Object.values(fileCov.b || {})) {
          counts.fill(0);
        }
      }
    }
    objects = [];
    track(currentWin);
    return f;
  }

  function fileRecords(coverage) {
    let table = fileTables.get(coverage);
    if (!table) {
      table = { records: [], known: new Set(), size: 0 };
      fileTables.set(coverage, table);
    }
    // Lazily loaded modules add their files the first time they run, so new files show up as a larger key count.
    const size = Object.keys(coverage).length;
    if (size !== table.size) {
      table.size = size;
      for (const file in coverage) {
        if (!table.known.has(file)) {
          table.known.add(file);
          const counts = coverage[file]?.f;
          if (counts) {
            const n = Object.keys(counts).length;
            table.records.push({
              file,
              counts,
              n,
              previous: new Uint32Array(n),
            });
          }
        }
      }
    }
    return table.records;
  }

  // The flush zeroes the counters after every test, so the counts a cut compares against start from zero too.
  function resetPreviousCounts() {
    for (const coverage of objects) {
      for (const record of fileTables.get(coverage)?.records ?? []) {
        record.previous.fill(0);
      }
    }
  }

  // Function counters that grew since the previous cut, as flat [file, fnIndex, delta] triples.
  // The counters themselves are left alone, so the per-test flush still reads the real totals,
  // which is what lets a reader check that the steps add up to them.
  // A frame runs the same files as the window around it, so their deltas are summed into one triple per function.
  function functionDeltas(fileIndex) {
    const deltas = [];
    const positions = objects.length > 1 ? new Map() : null;
    for (const coverage of objects) {
      for (const record of fileRecords(coverage)) {
        const { counts, n, previous } = record;
        for (let i = 0; i < n; i++) {
          const count = counts[i];
          if (count > previous[i]) {
            const index = fileIndex(record.file);
            const delta = count - previous[i];
            previous[i] = count;
            const key = positions ? `${index}#${i}` : null;
            const at = positions?.get(key);
            if (at === undefined) {
              positions?.set(key, deltas.length);
              deltas.push(index, i, delta);
            } else {
              deltas[at + 2] += delta;
            }
          }
        }
      }
    }
    return deltas;
  }

  return { track, collectAndZero, resetPreviousCounts, functionDeltas };
}
