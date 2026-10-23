import fs from "node:fs";
import path from "node:path";

import { changedFiles, readWorking, showAt } from "./git.mjs";
import { listRelatedSpecs } from "./runners.mjs";
import { parseSpecTests } from "./scope.mjs";
import { findDuplicates, scanSpecs } from "./unit-scan.mjs";

const SPEC_RE = /\.unit\.spec\.[jt]sx?$/;
const SCRIPT_RE = /\.[jt]sx?$/;
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
const GENERIC_WORDS = new Set(["list", "section", "component", "components", "modal", "button", "page", "view", "container", "utils", "index", "item", "items", "menu", "form", "content", "header", "panel", "use", "hook", "hooks", "tests", "test", "unit", "spec", "common", "enterprise"]);
const TITLE_RE = /\b(?:it|test|describe)(?:\.\w+)*\(\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g;

const isHelper = (file) => /(^|\/)(tests?|__support__|__mocks__|mocks?)\//.test(file) || /(^|\/)setup[^/]*$/.test(file);

function resolveRelative(root, fromFile, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const base = path.join(path.dirname(fromFile), specifier);
  for (const ext of EXTENSIONS) {
    const abs = path.join(root, base + ext);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return path.normalize(base + ext);
    }
  }
  return null;
}

function relativeImports(ts, root, file) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  return sf.statements
    .filter((st) => ts.isImportDeclaration(st) && !st.importClause?.isTypeOnly && ts.isStringLiteral(st.moduleSpecifier))
    .map((st) => resolveRelative(root, file, st.moduleSpecifier.text))
    .filter((f) => f && SCRIPT_RE.test(f));
}

// The product files a spec tests are its relative imports, following one hop through test helpers such as a `setup` file.
export function sourcesOfSpec(ts, root, spec, cache = new Map()) {
  if (cache.has(spec)) {
    return cache.get(spec);
  }
  const out = new Set();
  for (const f of relativeImports(ts, root, spec)) {
    if (SPEC_RE.test(f)) {
      continue;
    }
    if (isHelper(f)) {
      for (const g of relativeImports(ts, root, f)) {
        if (!SPEC_RE.test(g) && !isHelper(g)) {
          out.add(g);
        }
      }
    } else {
      out.add(f);
    }
  }
  cache.set(spec, [...out]);
  return [...out];
}

function keywordsOf(source) {
  const name = path.basename(source).replace(/\.[jt]sx?$/, "").replace(/^use-?/, "");
  return name
    .split(/[-_.]|(?=[A-Z])/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !GENERIC_WORDS.has(w));
}

function titlesMentioning(root, spec, words) {
  if (!words.length) {
    return [];
  }
  const re = new RegExp(`\\b(${words.join("|")})s?\\b`, "i");
  const text = fs.readFileSync(path.join(root, spec), "utf8");
  return [...text.matchAll(TITLE_RE)].map((m) => m[2]).filter((t) => re.test(t));
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

// Splits the specs jest relates to a source file into those that import it, directly or through a test helper,
// and those that only load it through other modules, keeping the indirect ones whose test titles name it.
async function specsFor({ ts, root, source, exclude, cache, children }) {
  const listed = (await listRelatedSpecs({ root, file: source, children })).filter((s) => !exclude.has(s));
  const direct = listed.filter((s) => sourcesOfSpec(ts, root, s, cache).includes(source)).sort(near(source));
  const indirect = listed.filter((s) => !direct.includes(s));
  const words = keywordsOf(source);
  const mentions = indirect
    .map((spec) => ({ spec, titles: titlesMentioning(root, spec, words) }))
    .filter((m) => m.titles.length)
    .sort((a, b) => near(source)(a.spec, b.spec))
    .slice(0, 3);
  return { source, direct, indirectCount: indirect.length, words, mentions };
}

const site = (r) => `${r.file}:${r.line}`;

function duplicateLines(dups, isFocus, focusWord) {
  if (!dups.length) {
    return ["  No exact copies or prefix pairs."];
  }
  return dups.map(({ kind, a, b }) => {
    const label = (r) => `${isFocus(r) ? focusWord : "existing"} "${r.title}" (${site(r)})`;
    return kind === "exact copy" ? `  Exact copy: ${label(a)} and ${label(b)}` : `  Prefix: ${label(a)} is the opening steps of ${label(b)}`;
  });
}

function relatedLines(groups, { titles, root, ts }) {
  const lines = [];
  for (const g of groups) {
    lines.push(`  ${g.source}`);
    if (!g.direct.length) {
      lines.push("    No existing spec imports it.");
    }
    for (const spec of g.direct) {
      const tests = parseSpecTests(ts, spec, readWorking(root, spec));
      lines.push(`    ${spec} (${tests.length} tests)`);
      if (titles) {
        for (const t of tests.slice(0, 12)) {
          lines.push(`      ${t.title}`);
        }
        if (tests.length > 12) {
          lines.push(`      and ${tests.length - 12} more`);
        }
      }
    }
    for (const m of g.mentions) {
      lines.push(`    ${m.spec} may cover it: it loads it indirectly, and ${m.titles.length} test title(s) mention ${g.words.join(" or ")}, such as "${m.titles[0]}"`);
    }
    if (g.indirectCount) {
      lines.push(`    ${g.indirectCount} more spec(s) load it indirectly.`);
    }
  }
  return lines;
}

export function extendLines(perSpec) {
  return perSpec
    .filter((p) => p.status === "new")
    .flatMap((p) => p.groups.filter((g) => g.direct.length).map((g) => `  ${p.spec} is new, but ${g.direct[0]} already tests ${g.source}. Add the tests there instead.`));
}

export async function existingForPr({ ts, root, mergeBase }) {
  const started = Date.now();
  const cache = new Map();
  const prSpecs = changedFiles(root, mergeBase).filter((c) => c.status !== "D" && SPEC_RE.test(c.path));
  if (!prSpecs.length) {
    return { none: true, text: "This branch adds or changes no jest specs.", ms: Date.now() - started, duplicates: [] };
  }
  const exclude = new Set(prSpecs.map((c) => c.path));
  const newLines = new Set();
  for (const c of prSpecs) {
    const before = new Set(c.status === "A" ? [] : parseSpecTests(ts, c.from, showAt(root, mergeBase, c.from)).map((t) => t.title));
    for (const t of parseSpecTests(ts, c.path, readWorking(root, c.path))) {
      if (!before.has(t.title)) {
        newLines.add(`${c.path}:${t.line}`);
      }
    }
  }
  const isNew = (r) => newLines.has(site(r));
  const perSpec = [];
  for (const c of prSpecs) {
    const groups = [];
    for (const source of sourcesOfSpec(ts, root, c.path, cache)) {
      groups.push(await specsFor({ ts, root, source, exclude, cache }));
    }
    perSpec.push({ spec: c.path, status: c.status === "A" ? "new" : "changed", groups });
  }
  const scanned = [...exclude, ...perSpec.flatMap((p) => p.groups.flatMap((g) => g.direct))];
  const duplicates = findDuplicates(scanSpecs({ ts, root, files: [...new Set(scanned)] }), isNew);
  const lines = [];
  for (const p of perSpec) {
    const added = [...newLines].filter((l) => l.startsWith(`${p.spec}:`)).length;
    lines.push(`${p.spec} (${p.status}, ${added} new test(s)) tests:`);
    lines.push(...(p.groups.length ? relatedLines(p.groups, { titles: false, root, ts }) : ["  No product file found among its relative imports."]));
    lines.push("");
  }
  const extend = extendLines(perSpec);
  if (extend.length) {
    lines.push("Specs to extend instead of adding new ones:", ...extend, "");
  }
  lines.push("Duplicates involving this PR's new tests:", ...duplicateLines(duplicates, isNew, "new"));
  return { text: lines.join("\n"), ms: Date.now() - started, duplicates };
}

export async function existingForPath({ ts, root, target }) {
  const started = Date.now();
  const cache = new Map();
  const isSpec = SPEC_RE.test(target);
  const sources = isSpec ? sourcesOfSpec(ts, root, target, cache) : [target];
  const exclude = new Set(isSpec ? [target] : []);
  const groups = [];
  for (const source of sources) {
    groups.push(await specsFor({ ts, root, source, exclude, cache }));
  }
  const lines = [isSpec ? `${target} tests:` : "Existing specs:"];
  lines.push(...(groups.length ? relatedLines(groups, { titles: true, root, ts }) : ["  No product file found among its relative imports."]));
  let duplicates = [];
  if (isSpec) {
    const files = [...new Set([target, ...groups.flatMap((g) => g.direct)])];
    duplicates = findDuplicates(scanSpecs({ ts, root, files }), (r) => r.file === target);
    lines.push("", `Duplicates involving ${target}:`, ...duplicateLines(duplicates, (r) => r.file === target, "this spec's"));
  }
  return { text: lines.join("\n"), ms: Date.now() - started, duplicates };
}
