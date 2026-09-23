// Offline validation — needs no Metabase instance.
//
//   node validate.ts --corpus ../scenarios/corpus/northwind.json --scenarios ../scenarios/src/golden.json
//
// Checks the corpus structure, every scenario's shape, that every ref exists in the corpus with the
// model its key claims, and prints the category mix. Exits non-zero on any error.
import {
  type AuthoredScenarioFile, type Corpus, CATEGORY_TAGS,
  corpusKeys, fail, parseArgs, readJson, validateCorpus,
} from "./lib.ts";

const args = parseArgs(process.argv.slice(2));
if (!args.corpus) fail("--corpus <corpus.json> is required");

const corpus = readJson<Corpus>(args.corpus);
const errs = validateCorpus(corpus).map((e) => `corpus: ${e}`);
const keys = corpusKeys(corpus);

if (args.scenarios) {
  const file = readJson<AuthoredScenarioFile>(args.scenarios);
  if (file.corpusId !== corpus.corpusId) errs.push(`scenarios target corpus ${file.corpusId}, corpus is ${corpus.corpusId}`);
  const ids = new Set<string>();
  for (const s of file.scenarios) {
    const where = `scenario ${s.id}`;
    if (!s.id || ids.has(s.id)) errs.push(`${where}: missing or duplicate id`);
    ids.add(s.id);
    if (!s.query?.trim()) errs.push(`${where}: empty query`);
    if (!s.lang) errs.push(`${where}: missing lang`);
    if (!Array.isArray(s.tags) || !s.tags.some((t) => (CATEGORY_TAGS as readonly string[]).includes(t))) {
      errs.push(`${where}: needs at least one category tag (${CATEGORY_TAGS.join(", ")})`);
    }
    const isEmpty = s.tags.includes("empty-expected");
    if (isEmpty && s.expected.length) errs.push(`${where}: empty-expected but has expected items`);
    if (!isEmpty && !s.expected.length) errs.push(`${where}: no expected items and not tagged empty-expected`);
    const refs = new Set<string>();
    for (const item of s.expected) {
      if (!keys.has(item.ref)) errs.push(`${where}: unknown ref ${item.ref}`);
      if (item.grade !== 1 && item.grade !== 2) errs.push(`${where}: ${item.ref} grade must be 1 or 2`);
      if (refs.has(item.ref)) errs.push(`${where}: ${item.ref} listed twice`);
      refs.add(item.ref);
    }
    for (const item of s.expectedAbsent ?? []) {
      if (!keys.has(item.ref)) errs.push(`${where}: unknown expectedAbsent ref ${item.ref}`);
      if (refs.has(item.ref)) errs.push(`${where}: ${item.ref} is both expected and expectedAbsent`);
    }
  }

  const n = file.scenarios.length;
  console.log(`${n} scenarios over ${keys.size} corpus keys`);
  for (const tag of CATEGORY_TAGS) {
    const k = file.scenarios.filter((s) => s.tags.includes(tag)).length;
    console.log(`  ${tag.padEnd(15)} ${String(k).padStart(3)}  ${((100 * k) / n).toFixed(0).padStart(3)}%`);
  }
  const byLang = Object.groupBy(file.scenarios, (s) => s.lang);
  console.log(`  langs: ${Object.entries(byLang).map(([l, v]) => `${l}=${v!.length}`).join(" ")}`);
}

if (errs.length) {
  for (const e of errs) console.error(`  ✗ ${e}`);
  fail(`${errs.length} problem(s)`);
}
console.log("valid");
