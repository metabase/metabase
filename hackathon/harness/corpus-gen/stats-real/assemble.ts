// Joins frozen slots with blind-written queries into the §3 scenario file for stats-real-v1 (local only).
// Ids are pinned to the snapshot version, so refs ("card/123") resolve directly to {model, id}.
//
//   node assemble.ts --slots ../../../../local/stats-real/slots-v1.json \
//     --queries ../../../../local/stats-real/blind-queries-v1.json --out ../../../../local/stats-real/scenarios-v1.json
import { fail, parseArgs, readJson, writeJson } from "../lib.ts";

type Slot = { id: string; tags: string[]; expected: { ref: string; grade: number }[]; target: string | null; documented: boolean | null };
const args = parseArgs(process.argv.slice(2));
for (const k of ["slots", "queries", "out"]) if (!args[k]) fail(`--${k} is required`);
const { slots } = readJson<{ slots: Slot[] }>(args.slots);
const queries = new Map(readJson<{ id: string; query: string }[]>(args.queries).map((q) => [q.id, q.query]));

const missing = slots.filter((s) => !queries.get(s.id)?.trim()).map((s) => s.id);
if (missing.length) fail(`no query for slots: ${missing.join(", ")}`);

const scenarios = slots.map((s) => ({
  id: s.id,
  query: queries.get(s.id)!.trim(),
  tags: [...s.tags, ...(s.documented === false ? ["undocumented"] : s.documented ? ["documented"] : [])],
  lang: "en",
  expected: s.expected.map(({ ref, grade }) => {
    const [model, id] = ref.split("/");
    return { model, id: Number(id), grade, ref };
  }),
}));
writeJson(args.out, scenarios);
console.log(`${scenarios.length} scenarios -> ${args.out}`);
