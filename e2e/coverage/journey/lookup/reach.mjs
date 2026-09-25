// Reads {"tests": [test id, ...], "locations": {"<name>": [location, ...]}} on stdin and writes JSON:
// which of those tests reach each named group of locations, and the keys each of those tests reached.
//   node reach.mjs --index <index dir> [--repo <path>] [--sha <commit>] < request.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./args.mjs";
import {
  describeResolved,
  loadIndex,
  parseLocation,
  query,
  resolveLocation,
} from "./lib.mjs";
import { repoRoot } from "./source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const indexDir = args.index ?? process.env.JOURNEY_LOOKUP_INDEX;
if (!indexDir) {
  console.error(
    "Usage: node reach.mjs --index <index dir> [--repo <path>] [--sha <commit>] < request.json",
  );
  process.exit(1);
}

const request = JSON.parse(fs.readFileSync(0, "utf8"));
const index = loadIndex(indexDir);
const ctx = {
  repo: args.repo ?? repoRoot(here),
  sha: args.sha ?? index.meta.sha,
};

const testIndexOf = new Map(index.tests.map((test, i) => [test.id, i]));
const wanted = new Map(
  (request.tests ?? [])
    .filter((id) => testIndexOf.has(id))
    .map((id) => [testIndexOf.get(id), []]),
);
index.keys.forEach((_, keyId) => {
  const start = index.offsets[keyId];
  for (let i = start; i < start + index.lengths[keyId]; i += 2) {
    wanted.get(index.postings[i])?.push(keyId);
  }
});

function resolve(location) {
  try {
    const loc =
      typeof location === "string" ? parseLocation(location) : location;
    return { location, ...resolveLocation(index, loc, ctx) };
  } catch (error) {
    return { location, kind: "unknown", keys: [], notes: [error.message] };
  }
}

const tests = {};
for (const [testIndex, keys] of wanted) {
  const test = index.tests[testIndex];
  tests[test.id] = { state: test.state, keys };
}
const ids = new Set(Object.keys(tests));

const locations = {};
for (const [name, group] of Object.entries(request.locations ?? {})) {
  const resolved = group.map(resolve);
  const { reach } = query(
    index,
    resolved.flatMap((r) => r.keys),
    { includeNotPassing: true },
  );
  locations[name] = {
    resolved: resolved.map((r) => ({
      location: r.location,
      kind: r.kind,
      keys: r.keys.length,
      resolved: describeResolved(r),
      notes: r.notes ?? [],
    })),
    reach: reach.filter((row) => ids.has(row.id)).map((row) => row.id),
  };
}

process.stdout.write(
  JSON.stringify({
    sha: ctx.sha,
    runs: index.meta.runs.map((run) => run.runId),
    tests,
    locations,
  }),
);
