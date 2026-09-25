// Builds the reach index from journey-capture run directories.
//   node build-index.mjs --run <dir> [--rerun <dir>] --out <index dir>
import fs from "node:fs";
import path from "node:path";

import * as reader from "../../journey-capture.mjs";

import { parseArgs } from "./args.mjs";

const args = parseArgs(process.argv.slice(2), {
  multiple: ["rerun"],
});
if (!args.run || !args.out) {
  console.error(
    "Usage: node build-index.mjs --run <dir> [--rerun <dir> ...] --out <index dir>",
  );
  process.exit(1);
}

const RUNNER_PREFIX = "/home/runner/work/metabase/metabase/";
const relative = (file) =>
  file.startsWith(RUNNER_PREFIX) ? file.slice(RUNNER_PREFIX.length) : file;
const HOOK_PHASES_AFTER = new Set(["after each", "after all"]);

const runs = [
  { label: "full", dir: args.run },
  ...(args.rerun ?? []).map((dir, i) => ({ label: `rerun${i + 1}`, dir })),
];
const started = Date.now();
const log = (msg) =>
  console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);

// Pass 1: the backend baseline is the union of every shard's coverage-baseline classes,
// because each shard has its own backend and its baseline varies.
const backendBaseline = new Set();
const frontendBaselineShards = new Map();
let shardCount = 0;
for (const run of runs) {
  for (const dir of reader.shardDirs(run.dir)) {
    const shard = reader.loadShard(dir);
    shardCount += 1;
    const names = (dump) =>
      (dump?.classes ?? []).map((i) => shard.classes[i]?.[0]);
    const fired = new Set();
    for (const entry of shard.baselines) {
      if (entry.baseline?.name !== "coverage-baseline") {
        continue;
      }
      for (const test of entry.tests) {
        for (const name of names(test.backend?.test)) {
          if (name) {
            backendBaseline.add(name);
          }
        }
        for (const [file, counts] of Object.entries(test.f ?? {})) {
          for (const [index, count] of Object.entries(counts)) {
            if (count > 0) {
              fired.add(`${relative(file)}#${index}`);
            }
          }
        }
      }
    }
    for (const key of fired) {
      frontendBaselineShards.set(
        key,
        (frontendBaselineShards.get(key) ?? 0) + 1,
      );
    }
  }
}
log(
  `baselines: ${backendBaseline.size} backend classes over ${shardCount} shards`,
);

// Pass 2: per test, the attempt to use, and for every reached function or class,
// the passing assertions from the first step cut that holds it onwards.
const keyIds = new Map();
const keys = [];
const keyId = (key) => {
  let id = keyIds.get(key);
  if (id === undefined) {
    id = keys.length;
    keys.push(key);
    keyIds.set(key, id);
  }
  return id;
};
const fnmap = {};
const tests = new Map();

function assertSeqs(events) {
  return events
    .filter(
      (event) =>
        event.kind === "assert" &&
        event.state === "passed" &&
        !HOOK_PHASES_AFTER.has(event.phase),
    )
    .map((event) => event.seq)
    .sort((a, b) => a - b);
}

function countFrom(sortedSeqs, seq) {
  let lo = 0;
  let hi = sortedSeqs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedSeqs[mid] < seq) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return sortedSeqs.length - lo;
}

function summarizeAttempt(shard, raw, net) {
  const seqs = assertSeqs(raw.events ?? []);
  const reached = new Map();
  for (const fn of net.functions) {
    reached.set(keyId(`fe:${fn}`), -1);
  }
  const classNames = new Set();
  for (const i of raw.backend?.test?.classes ?? []) {
    const name = shard.classes[i]?.[0];
    if (name && !backendBaseline.has(name)) {
      classNames.add(name);
      reached.set(keyId(`be:${name}`), -1);
    }
  }
  const cuts = raw.steps?.cuts ?? [];
  const files = raw.steps?.files ?? [];
  for (const cut of cuts) {
    // An assertion cut holds the code that ran up to and during that assertion, so the assertion counts.
    const from =
      cut.trigger === "assert" && cut.triggerSeq != null
        ? cut.triggerSeq
        : cut.seq;
    const after = countFrom(seqs, from);
    const f = cut.f ?? [];
    for (let i = 0; i + 2 < f.length; i += 3) {
      if (f[i + 2] <= 0) {
        continue;
      }
      const id = keyIds.get(`fe:${relative(files[f[i]])}#${f[i + 1]}`);
      if (id !== undefined && reached.get(id) === -1) {
        reached.set(id, after);
      }
    }
    for (const c of cut.backend?.classes ?? []) {
      const name = shard.classes[c]?.[0];
      if (!classNames.has(name)) {
        continue;
      }
      const id = keyIds.get(`be:${name}`);
      if (reached.get(id) === -1) {
        reached.set(id, after);
      }
    }
  }
  const ids = [...reached.keys()].sort((a, b) => a - b);
  const packed = new Uint32Array(ids.length * 2);
  ids.forEach((id, i) => {
    packed[2 * i] = id;
    packed[2 * i + 1] = reached.get(id) + 1;
  });
  return {
    state: raw.state,
    attempt: raw.attempt,
    asserts: seqs.length,
    steps: cuts.length > 0,
    packed,
  };
}

for (const run of runs) {
  const isRerun = run.label !== "full";
  for (const dir of reader.shardDirs(run.dir)) {
    const shard = reader.loadShard(dir);
    for (const [file, fns] of Object.entries(
      Object.assign(
        {},
        ...fs
          .readdirSync(dir)
          .filter((name) => /^fnmap-.*\.json$/.test(name))
          .map((name) =>
            JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")),
          ),
      ),
    )) {
      fnmap[relative(file)] ??= fns;
    }
    const net = reader.subtractBaselines(shard);
    const rawByKey = new Map();
    for (const entry of shard.tests) {
      for (const test of entry.tests) {
        rawByKey.set(
          `${entry.spec}\u0000${test.title}\u0000${test.attempt}`,
          test,
        );
      }
    }
    // Group attempts per test and keep the last passing one, or the last one when none passed.
    const byTest = new Map();
    for (const attempt of net) {
      const id = `${attempt.spec}::${attempt.title}`;
      const list = byTest.get(id) ?? [];
      list.push(attempt);
      byTest.set(id, list);
    }
    for (const [id, attempts] of byTest) {
      attempts.sort((a, b) => a.attempt - b.attempt);
      const passing = attempts.filter((a) => a.state === "passed");
      const chosen = passing.at(-1) ?? attempts.at(-1);
      const existing = tests.get(id);
      if (isRerun) {
        // The rerun only replaces tests that had no passing attempt in the full run.
        if (existing?.state === "passed" || chosen.state !== "passed") {
          continue;
        }
      } else if (
        existing &&
        (existing.state === "passed" || chosen.state !== "passed")
      ) {
        continue;
      }
      const raw = rawByKey.get(
        `${chosen.spec}\u0000${chosen.title}\u0000${chosen.attempt}`,
      );
      tests.set(id, {
        id,
        spec: chosen.spec,
        title: chosen.title,
        run: run.label,
        shard: shard.meta.shard?.index,
        attempts: attempts.length,
        ...summarizeAttempt(shard, raw, chosen),
      });
    }
    log(
      `${run.label} ${path.basename(dir)}: ${tests.size} tests, ${keys.length} keys`,
    );
  }
}

// postings.bin holds, per key, pairs of (test index, 1 + asserts after the first cut holding the key, or 0 when no cut held it).
fs.mkdirSync(args.out, { recursive: true });
const testList = [...tests.values()].sort((a, b) => a.id.localeCompare(b.id));
const postings = keys.map(() => []);
testList.forEach((test, testIndex) => {
  const { packed } = test;
  for (let i = 0; i < packed.length; i += 2) {
    postings[packed[i]].push(testIndex, packed[i + 1]);
  }
});
const total = postings.reduce((n, list) => n + list.length, 0);
const buffer = new Uint32Array(total);
const offsets = new Array(keys.length);
let at = 0;
postings.forEach((list, id) => {
  offsets[id] = at;
  buffer.set(list, at);
  at += list.length;
});
fs.writeFileSync(
  path.join(args.out, "postings.bin"),
  Buffer.from(buffer.buffer),
);
fs.writeFileSync(
  path.join(args.out, "keys.json"),
  JSON.stringify({
    keys,
    offsets,
    lengths: postings.map((list) => list.length),
  }),
);
fs.writeFileSync(
  path.join(args.out, "tests.json"),
  JSON.stringify(
    testList.map((test) => ({ ...test, packed: undefined })),
    null,
    0,
  ),
);
fs.writeFileSync(path.join(args.out, "fnmap.json"), JSON.stringify(fnmap));
fs.writeFileSync(
  path.join(args.out, "baseline.json"),
  JSON.stringify({
    shards: shardCount,
    backend: [...backendBaseline].sort(),
    frontendShards: Object.fromEntries(frontendBaselineShards),
  }),
);
fs.writeFileSync(
  path.join(args.out, "meta.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      sha: reader.loadShard(reader.shardDirs(args.run)[0]).meta.sha,
      runs: runs.map((run) => ({
        ...run,
        runId: reader.loadShard(reader.shardDirs(run.dir)[0]).meta.runId,
      })),
      tests: testList.length,
      byState: testList.reduce(
        (acc, t) => ({ ...acc, [t.state]: (acc[t.state] ?? 0) + 1 }),
        {},
      ),
      byRun: testList.reduce(
        (acc, t) => ({ ...acc, [t.run]: (acc[t.run] ?? 0) + 1 }),
        {},
      ),
      keys: keys.length,
      postings: total / 2,
    },
    null,
    2,
  ),
);
log(
  `wrote ${testList.length} tests, ${keys.length} keys, ${total / 2} postings to ${args.out}`,
);
