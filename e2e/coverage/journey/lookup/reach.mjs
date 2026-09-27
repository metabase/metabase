// Reads {"tests": [test id, ...], "locations": {"<name>": [location, ...]}} on stdin and writes JSON:
// which of those tests reach each named group of locations, by basis, and the keys each of those tests reached.
//   node reach.mjs --index <index dir> [--repo <path>] [--sha <commit>] < request.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./args.mjs";
import {
  describeResolved,
  keysReachedBy,
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

function resolve(location) {
  try {
    const loc =
      typeof location === "string" ? parseLocation(location) : location;
    return { location, ...resolveLocation(index, loc, ctx) };
  } catch (error) {
    return { location, kind: "unknown", keys: [], notes: [error.message] };
  }
}

const stateOf = new Map(index.tests.map((test) => [test.id, test.state]));
const tests = {};
for (const [id, keys] of keysReachedBy(index, request.tests ?? [])) {
  tests[id] = { state: stateOf.get(id), keys };
}
const ids = new Set(Object.keys(tests));

const requested = (rows) =>
  rows.filter((row) => ids.has(row.id)).map((row) => row.id);

const locations = {};
for (const [name, group] of Object.entries(request.locations ?? {})) {
  const resolved = group.map(resolve);
  const { reach, byBasis } = query(
    index,
    resolved.flatMap((r) => r.keys),
    { includeNotPassing: true },
  );
  locations[name] = {
    resolved: resolved.map((r) => ({
      location: r.location,
      kind: r.kind,
      file: r.file ?? null,
      keys: r.keys.length,
      baseline_keys: r.baselineKeys ?? 0,
      resolved: describeResolved(r),
      notes: r.notes ?? [],
    })),
    reach: requested(reach),
    reach_by_basis: Object.fromEntries(
      Object.entries(byBasis).map(([basis, view]) => [
        basis,
        requested(view.reach),
      ]),
    ),
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
