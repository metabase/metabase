// Prints the e2e tests that reach a code location, and those that reach it and then assert.
// See ../README.md for location syntax and options.
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
const args = parseArgs(process.argv.slice(2), {
  booleans: ["json", "union", "include-not-passing", "help"],
});

function usage() {
  const readme = fs.readFileSync(path.join(here, "../README.md"), "utf8");
  const start = readme.indexOf("\n## Reach lookup");
  if (start === -1) {
    return readme;
  }
  const end = readme.indexOf("\n## ", start + 1);
  return readme.slice(start + 1, end === -1 ? undefined : end);
}

if (args.help || (args._.length === 0 && !args.locations)) {
  console.error(usage());
  process.exit(args.help ? 0 : 1);
}

const indexDir = args.index ?? process.env.JOURNEY_LOOKUP_INDEX;
if (!indexDir) {
  console.error(
    "Pass the index directory with --index <dir> or JOURNEY_LOOKUP_INDEX.",
  );
  process.exit(1);
}

const index = loadIndex(indexDir);
const ctx = {
  repo: args.repo ?? repoRoot(here),
  sha: args.sha ?? index.meta.sha,
};
const exclude = new Set(
  args.exclude
    ? fs
        .readFileSync(args.exclude, "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [],
);

const texts = [
  ...args._,
  ...(args.locations
    ? fs
        .readFileSync(args.locations, "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : []),
];
const locations = texts.map(parseLocation);
const resolved = locations.map((loc) => ({
  loc,
  ...resolveLocation(index, loc, ctx),
}));
const options = { exclude, includeNotPassing: args["include-not-passing"] };

const results = args.union
  ? [
      {
        locations: resolved,
        ...query(
          index,
          resolved.flatMap((r) => r.keys),
          options,
        ),
      },
    ]
  : resolved.map((r) => ({ locations: [r], ...query(index, r.keys, options) }));

const idsOf = (rows) => rows.map((r) => r.id);
const countLoads = (rows) =>
  Object.entries(
    rows.reduce((acc, r) => ({ ...acc, [r.load]: (acc[r.load] ?? 0) + 1 }), {}),
  )
    .map(([load, n]) => `${load} ${n}`)
    .join(", ");
const assertsAfterOf = (rows) =>
  Object.fromEntries(rows.map((r) => [r.id, r.assertsAfter]));

if (args.json) {
  for (const result of results) {
    console.log(
      JSON.stringify({
        locations: result.locations,
        reach: idsOf(result.reach),
        reach_and_assert: idsOf(result.reachAndAssert),
        asserts_after: assertsAfterOf(result.reach),
        not_passing: result.notPassing,
        basis: Object.fromEntries(result.reach.map((r) => [r.id, r.basis])),
        ...(result.baselineKeys > 0
          ? {
              by_basis: Object.fromEntries(
                Object.entries(result.byBasis).map(([basis, view]) => [
                  basis,
                  {
                    reach: idsOf(view.reach),
                    reach_and_assert: idsOf(view.reachAndAssert),
                    asserts_after: assertsAfterOf(view.reach),
                    ...(basis === "baseline"
                      ? {
                          load: Object.fromEntries(
                            view.reach.map((r) => [r.id, r.load]),
                          ),
                        }
                      : {}),
                  },
                ]),
              ),
            }
          : {}),
      }),
    );
  }
} else {
  for (const result of results) {
    for (const r of result.locations) {
      console.log(`# ${JSON.stringify(r.loc)}`);
      console.log(`  resolved: ${r.keys.length} keys ${describeResolved(r)}`);
      for (const note of r.notes ?? []) {
        console.log(`  note: ${note}`);
      }
    }
    console.log(
      `  reach: ${result.reach.length}, reach and assert: ${result.reachAndAssert.length}` +
        (result.notPassing.length
          ? `, not passing (left out): ${result.notPassing.length}`
          : ""),
    );
    const inferred = new Map(
      result.byBasis.baseline.reach.map((r) => [r.id, r]),
    );
    if (result.baselineKeys > 0) {
      const { subtraction, baseline } = result.byBasis;
      console.log(
        `  basis subtraction: reach ${subtraction.reach.length}, reach and assert ${subtraction.reachAndAssert.length}; ` +
          `basis baseline: reach ${baseline.reach.length}, reach and assert ${baseline.reachAndAssert.length}, ` +
          `by load: ${countLoads(baseline.reach) || "none"}`,
      );
    }
    for (const row of result.reach) {
      const also = inferred.get(row.id);
      const mark =
        row.basis === "baseline"
          ? `  (baseline, ${row.load} load)`
          : also
            ? `  (also baseline, ${also.assertsAfter}, ${also.load} load)`
            : "";
      console.log(
        `  ${String(row.assertsAfter ?? "-").padStart(4)}  ${row.id}${mark}`,
      );
    }
  }
}
