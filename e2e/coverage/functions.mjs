/**
 * Per-test function manifest for the nightly instrumented run.
 *
 * The raw per-spec entries record, for every test attempt, the istanbul
 * function ids that fired per file, and the fnmap-*.json files name those
 * ids with a function name and start line. This flattens both into one
 * compact document that an offline consumer (the e2e-to-unit verify runner)
 * can read without the raw shards, which expire after a week:
 *
 *   { builtAt, totalTests, keys: ["<file>#<line>#<name>", …],
 *     frequency: [<tests that fired keys[i]>, …],
 *     tests: [{ spec, title, fired: [<key index>, …] }, …] }
 *
 * Boot noise is not subtracted here. `frequency` lets the consumer choose
 * its own cutoff for "fired by most tests".
 */

import path from "node:path";

function toRepoRelative(file, repoRoot) {
  const relative = path.isAbsolute(file) ? path.relative(repoRoot, file) : file;
  return relative.startsWith("..") ? null : relative;
}

export function buildFunctionManifest(entries, functionMaps, repoRoot) {
  const keyIds = new Map();
  const keys = [];
  const intern = (key) => {
    let id = keyIds.get(key);
    if (id === undefined) {
      id = keys.length;
      keys.push(key);
      keyIds.set(key, id);
    }
    return id;
  };

  const tests = [];
  for (const entry of Object.values(entries)) {
    // Retried attempts share a title; a function fired in any attempt counts.
    const byTitle = new Map();
    for (const attempt of entry.tests ?? []) {
      const fired = byTitle.get(attempt.title) ?? new Set();
      byTitle.set(attempt.title, fired);
      for (const [file, functions] of Object.entries(attempt.f ?? {})) {
        const relative = toRepoRelative(file, repoRoot);
        const names = functionMaps[file];
        if (relative === null || !names) {
          continue;
        }
        for (const [id, count] of Object.entries(functions)) {
          const meta = names[id];
          if (count > 0 && meta) {
            fired.add(intern(`${relative}#${meta.line}#${meta.name}`));
          }
        }
      }
    }
    for (const [title, fired] of byTitle) {
      tests.push({
        spec: entry.spec,
        title,
        fired: [...fired].sort((a, b) => a - b),
      });
    }
  }

  const frequency = new Array(keys.length).fill(0);
  for (const test of tests) {
    for (const id of test.fired) {
      frequency[id] += 1;
    }
  }
  return { totalTests: tests.length, keys, frequency, tests };
}
