// Turns authored scenarios (refs) into the §3 scenario file (live ids) using an apply.ts manifest.
// Fails loudly on any ref the manifest does not know — a stale label must never silently score zero.
//
//   node resolve.ts --scenarios ../scenarios/src/golden.json \
//                   --manifest ../artifacts/golden/manifest.json \
//                   [--out ../scenarios/golden.json]
import { join } from "node:path";
import {
  type AuthoredItem, type AuthoredScenarioFile, type Manifest, type Scenario,
  fail, parseArgs, readJson, writeJson,
} from "./lib.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.scenarios || !args.manifest) fail("--scenarios and --manifest are required");

const file = readJson<AuthoredScenarioFile>(args.scenarios);
const manifest = readJson<Manifest>(args.manifest);
if (file.corpusId !== manifest.corpusId) fail(`scenarios are for ${file.corpusId}, manifest is for ${manifest.corpusId}`);

const missing: string[] = [];
const resolveItems = (scenarioId: string, items: AuthoredItem[]) =>
  items.map((item) => {
    const hit = manifest.entities[item.ref];
    if (!hit) missing.push(`${scenarioId}: ${item.ref}`);
    return { model: hit?.model ?? "card", id: hit?.id ?? -1, ...item };
  });

// validate.ts guarantees every expected item has a grade; expectedAbsent items carry none.
const scenarios = file.scenarios.map((s) => ({
  ...s,
  expected: resolveItems(s.id, s.expected),
  expectedAbsent: s.expectedAbsent?.length ? resolveItems(s.id, s.expectedAbsent) : undefined,
})) as Scenario[];

if (missing.length) fail(`${missing.length} ref(s) not in manifest:\n  ${missing.join("\n  ")}`);

const out = args.out ?? join(import.meta.dirname, "../scenarios", `${manifest.corpusId}.json`);
writeJson(out, scenarios);
console.log(`resolved ${scenarios.length} scenarios against ${manifest.metabaseUrl} -> ${out}`);
