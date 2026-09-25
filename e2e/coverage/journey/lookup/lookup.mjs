// Prints the e2e tests that reach a code location, and those that reach it and then assert.
// See ../README.md for location syntax and options.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./args.mjs";
import { loadIndex, parseLocation, query, resolveLocation } from "./lib.mjs";

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

function defaultRepo() {
  try {
    return execFileSync("git", ["-C", here, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

const index = loadIndex(indexDir);
const ctx = {
  repo: args.repo ?? defaultRepo(),
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

if (args.json) {
  for (const result of results) {
    console.log(
      JSON.stringify({
        locations: result.locations,
        reach: result.reach.map((r) => r.id),
        reach_and_assert: result.reachAndAssert.map((r) => r.id),
        asserts_after: Object.fromEntries(
          result.reach.map((r) => [r.id, r.assertsAfter]),
        ),
        not_passing: result.notPassing,
      }),
    );
  }
} else {
  for (const result of results) {
    for (const r of result.locations) {
      console.log(`# ${JSON.stringify(r.loc)}`);
      const what =
        r.kind === "frontend"
          ? r.functions.map((f) => `${f.name}@${f.line}:${f.column}`).join(", ")
          : r.kind === "backend"
            ? `${r.classes.length} classes${r.via ? ` by ${r.via}` : ""}` +
              (r.cljsFunctions
                ? `, ${r.cljsFunctions.length} browser functions`
                : "")
            : "";
      console.log(`  resolved: ${r.keys.length} keys ${what}`);
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
    for (const row of result.reach) {
      console.log(
        `  ${String(row.assertsAfter ?? "-").padStart(4)}  ${row.id}`,
      );
    }
  }
}
