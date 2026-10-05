import fs from "node:fs";
import path from "node:path";

import { findCljCopies, scanClj } from "./clj-scan.mjs";
import { git } from "./git.mjs";

const LAYOUTS = [
  ["src/", "test/"],
  ["enterprise/backend/src/", "enterprise/backend/test/"],
];
const DRIVER_RE = /^(modules\/drivers\/[^/]+)\/(src|test)\/(.*)$/;
const TEST_GLOBS = ["test/**/*.clj", "enterprise/backend/test/**/*.clj", "modules/drivers/*/test/**/*.clj"].flatMap((g) => [`:(glob)${g}`, `:(glob)${g}c`]);
const FILES_SHOWN = 10;
const NAMES_SHOWN = 12;

const exists = (root, file) => fs.existsSync(path.join(root, file));

function testPaths(file) {
  const driver = file.match(DRIVER_RE);
  return [
    ...LAYOUTS.filter(([src]) => file.startsWith(src)).map(([src, test]) => test + file.slice(src.length)),
    ...(driver && driver[2] === "src" ? [`${driver[1]}/test/${driver[3]}`] : []),
  ].map((c) => c.replace(/\.(clj|cljc)$/, "_test.$1"));
}

const testPathFor = (file) => testPaths(file)[0] ?? file;

export function testFileFor(root, file) {
  return testPaths(file).find((c) => exists(root, c)) ?? null;
}

export function sourceFileFor(root, file) {
  const driver = file.match(DRIVER_RE);
  const candidates = [
    ...LAYOUTS.filter(([, test]) => file.startsWith(test)).map(([src, test]) => src + file.slice(test.length)),
    ...(driver && driver[2] === "test" ? [`${driver[1]}/src/${driver[3]}`] : []),
  ].map((c) => c.replace(/_test\.(clj|cljc)$/, ".$1"));
  return candidates.find((c) => c !== file && exists(root, c)) ?? null;
}

function testFileForNs(root, ns) {
  const rel = ns.replace(/-/g, "_").replace(/\./g, "/");
  const drivers = exists(root, "modules/drivers") ? fs.readdirSync(path.join(root, "modules/drivers")).map((d) => `modules/drivers/${d}/test/`) : [];
  for (const dir of ["test/", "enterprise/backend/test/", ...drivers]) {
    for (const ext of [".clj", ".cljc"]) {
      if (exists(root, dir + rel + ext)) {
        return dir + rel + ext;
      }
    }
  }
  return null;
}

function scanFile(root, file, cache) {
  if (!cache.has(file)) {
    cache.set(file, scanClj(fs.readFileSync(path.join(root, file), "utf8"), file));
  }
  return cache.get(file);
}

const near = (file) => (a, b) => {
  const common = (x) => {
    let i = 0;
    while (i < x.length && x[i] === file[i]) {
      i++;
    }
    return i;
  };
  return common(b) - common(a) || a.localeCompare(b);
};

// Finds the test files whose ns form requires `ns`, using git grep for candidates and the ns form to confirm.
function requiringTestFiles(root, ns, cache) {
  const escaped = ns.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out = git(root, ["grep", "-l", "-E", `(^|[[:space:]([])${escaped}([])[:space:]]|$)`, "--", ...TEST_GLOBS], { allowFail: true }) ?? "";
  return out
    .split("\n")
    .filter((f) => /_test\.cljc?$/.test(f))
    .filter((f) => scanFile(root, f, cache).requires.includes(ns));
}

// The source files a test file covers: its counterpart by path, or else the counterparts of the test namespaces it builds on.
function sourcesOfTest(root, testFile, cache) {
  const own = sourceFileFor(root, testFile);
  if (own) {
    return [{ file: own, how: "by naming convention" }];
  }
  return scanFile(root, testFile, cache)
    .requires.filter((ns) => ns.endsWith("-test"))
    .map((ns) => ({ ns, file: testFileForNs(root, ns) }))
    .map(({ ns, file }) => ({ file: file && sourceFileFor(root, file), how: `through ${ns}` }))
    .filter((s) => s.file);
}

function coverageOf(root, source, exclude, cache) {
  const ns = scanFile(root, source, cache).ns;
  const convention = testFileFor(root, source);
  const required = ns ? requiringTestFiles(root, ns, cache).filter((f) => f !== convention && !exclude.has(f)) : [];
  return {
    source,
    ns,
    files: [
      ...(convention && !exclude.has(convention) ? [{ file: convention, how: "by convention" }] : []),
      ...required.sort(near(testPathFor(source))).map((file) => ({ file, how: "by require" })),
    ],
  };
}

const wordsOf = (name) => name.split(/[-_!?>]+/).filter((w) => w.length > 2 && w !== "test");

// Lists the deftests that share words with the names being looked at first, so a short listing shows the closest ones.
function rankNames(names, focusNames) {
  const focus = new Set(focusNames.flatMap(wordsOf));
  const score = (n) => wordsOf(n).filter((w) => focus.has(w)).length;
  return names.map((n, i) => ({ n, i, s: score(n) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.n);
}

function testFileLines(root, entry, cache, indent, focusNames = []) {
  const names = rankNames(scanFile(root, entry.file, cache).tests.map((t) => t.name), focusNames);
  const lines = [`${indent}${entry.file}, ${entry.how} (${names.length} deftests)`];
  lines.push(...names.slice(0, NAMES_SHOWN).map((n) => `${indent}  ${n}`));
  if (names.length > NAMES_SHOWN) {
    lines.push(`${indent}  and ${names.length - NAMES_SHOWN} more`);
  }
  return lines;
}

function coverageLines(root, cov, cache, indent, focusNames = []) {
  if (!cov.files.length) {
    return [`${indent}No other test file covers it.`];
  }
  const shown = [...cov.files.filter((f) => f.how === "by convention"), ...cov.files.filter((f) => f.how === "by require").slice(0, FILES_SHOWN)];
  const lines = shown.flatMap((f) => testFileLines(root, f, cache, indent, focusNames));
  const hidden = cov.files.length - shown.length;
  if (hidden > 0) {
    lines.push(`${indent}and ${hidden} more test files require it.`);
  }
  return lines;
}

const site = (t) => `${t.file}:${t.line}`;

function copyLines(copies, isFocus, focusWord) {
  if (!copies.length) {
    return ["  No exact copies."];
  }
  const label = (t) => `${isFocus(t) ? focusWord : "existing"} ${t.ns}/${t.name} (${site(t)})`;
  return copies.map(({ a, b }) => `  Exact copy: ${label(a)} and ${label(b)}`);
}

const siblingTests = (root, file) =>
  fs
    .readdirSync(path.join(root, path.dirname(file)))
    .filter((f) => /_test\.cljc?$/.test(f))
    .map((f) => path.join(path.dirname(file), f));

// Checks for copies among the given test files and the test files beside the ones being looked at.
function copiesAmong(root, focusFiles, otherFiles, cache, involves) {
  const files = new Set([...focusFiles, ...otherFiles, ...focusFiles.flatMap((f) => siblingTests(root, f))]);
  return findCljCopies(
    [...files].flatMap((f) => scanFile(root, f, cache).tests),
    involves,
  );
}

export function cljExistingForPath({ root, target }) {
  const started = Date.now();
  const cache = new Map();
  const scanned = scanFile(root, target, cache);
  const isTest = /_test\.cljc?$/.test(target);
  const lines = [];
  let copies = [];
  if (!isTest) {
    const cov = coverageOf(root, target, new Set(), cache);
    lines.push(`${target} (${cov.ns}) is tested by:`, ...coverageLines(root, cov, cache, "  "));
  } else {
    const sources = sourcesOfTest(root, target, cache);
    lines.push(`${target} (${scanned.ns}) has ${scanned.tests.length} deftests.`);
    if (!sources.length) {
      lines.push("  No source namespace found by naming convention or through the test namespaces it requires.");
    }
    const related = [];
    for (const s of sources) {
      const cov = coverageOf(root, s.file, new Set([target]), cache);
      related.push(...cov.files.map((f) => f.file));
      lines.push(`  It tests ${s.file} (${cov.ns}), ${s.how}. Other test files for it:`, ...coverageLines(root, cov, cache, "    "));
    }
    copies = copiesAmong(root, [target], related, cache, (t) => t.file === target);
    lines.push("", `Exact copies involving ${target}:`, ...copyLines(copies, (t) => t.file === target, "this file's"));
  }
  return { text: lines.join("\n"), ms: Date.now() - started, duplicates: copies };
}

export function cljExistingForPr({ root, deftests }) {
  const started = Date.now();
  const cache = new Map();
  const prIds = new Set(deftests.map((d) => d.id));
  const isPr = (t) => prIds.has(`${t.ns}/${t.name}`);
  const byFile = new Map();
  for (const d of deftests) {
    byFile.set(d.file, [...(byFile.get(d.file) ?? []), d]);
  }
  const lines = [];
  const scannedFiles = [];
  for (const [file, ds] of byFile) {
    const scanned = scanFile(root, file, cache);
    const others = scanned.tests.filter((t) => !isPr(t)).map((t) => t.name);
    lines.push(`${file} (${scanned.ns}), ${ds.map((d) => `${d.status} ${d.id.split("/").pop()}`).join(", ")}:`);
    lines.push(
      others.length
        ? `  Existing deftests in the same namespace: ${others.slice(0, NAMES_SHOWN).join(", ")}${others.length > NAMES_SHOWN ? `, and ${others.length - NAMES_SHOWN} more` : ""}`
        : "  No other deftests in the same namespace.",
    );
    const sources = sourcesOfTest(root, file, cache);
    if (!sources.length) {
      lines.push("  No source namespace found by naming convention or through the test namespaces it requires.");
    }
    for (const s of sources) {
      const cov = coverageOf(root, s.file, new Set([file]), cache);
      scannedFiles.push(...cov.files.map((f) => f.file));
      lines.push(`  It tests ${s.file} (${cov.ns}), ${s.how}. Other test files for it:`, ...coverageLines(root, cov, cache, "    ", ds.map((d) => d.id.split("/").pop())));
    }
    lines.push("");
  }
  const copies = copiesAmong(root, [...byFile.keys()], scannedFiles, cache, isPr);
  lines.push("Exact copies involving this PR's new or changed deftests:", ...copyLines(copies, isPr, "this PR's"));
  return { text: lines.join("\n"), ms: Date.now() - started, duplicates: copies };
}
