import { createRequire } from "node:module";
import path from "node:path";

import { changedFiles, changedLineRanges, readWorking, showAt } from "./git.mjs";

const HOLE = "\u0000";
const E2E_SPEC_RE = /^e2e\/.*\.cy\.spec\.(js|jsx|ts|tsx)$/;
const JEST_SPEC_RE = /\.unit\.spec\.(js|jsx|ts|tsx)$/;
const DEFTEST_FILE_RE = /(^|\/)test\/.*_test\.clj[c]?$/;
const DRIVER_TEST_RE = /^modules\/drivers\/([^/]+)\/test\//;
const ASSERTION_RE =
  /\.should\(|\.and\(|\bexpect\(|\bassert|cy\.url\(|cy\.location\(|cy\.wait\(\s*["'`]@|verify\w*\(|\.contains\(|findBy|toHave|toBe/;

export function loadTypescript(root) {
  return createRequire(path.join(root, "package.json"))("typescript");
}

function textOf(ts, node) {
  if (!node) {
    return HOLE;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) {
      s += HOLE + span.literal.text;
    }
    return s;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return textOf(ts, node.left) + textOf(ts, node.right);
  }
  if (ts.isParenthesizedExpression(node)) {
    return textOf(ts, node.expression);
  }
  return HOLE;
}

function calleeName(ts, expr) {
  let e = expr;
  let modifier = null;
  if (ts.isPropertyAccessExpression(e) && ["skip", "only", "each"].includes(e.name.text)) {
    modifier = e.name.text;
    e = e.expression;
  }
  if (ts.isCallExpression(e)) {
    return { name: null, modifier };
  }
  if (ts.isIdentifier(e)) {
    return { name: e.text, modifier };
  }
  if (ts.isPropertyAccessExpression(e)) {
    return { name: e.name.text, modifier };
  }
  return { name: null, modifier };
}

const isDescribe = (n) => n && (n.startsWith("describe") || n === "context" || n === "xdescribe");
const isTest = (n) => n === "it" || n === "test" || n === "specify" || n === "xit";

// Lists the tests of a Cypress or jest spec with their full titles, the describe and it titles joined by spaces.
export function parseSpecTests(ts, file, text) {
  if (text == null) {
    return [];
  }
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const lines = text.split("\n");
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const tests = [];
  const visit = (node, stack, skip) => {
    if (ts.isCallExpression(node)) {
      const { name, modifier } = calleeName(ts, node.expression);
      if (isDescribe(name) || isTest(name)) {
        const title = textOf(ts, node.arguments[0]);
        const skipped = skip || modifier === "skip" || name === "xit" || name === "xdescribe";
        if (isTest(name)) {
          const full = [...stack, title].join(" ");
          const line = lineOf(node.getStart());
          const endLine = lineOf(node.getEnd());
          tests.push({
            title: full,
            own: title,
            pattern: full.includes(HOLE),
            skip: skipped,
            line,
            endLine,
            body: lines.slice(line - 1, endLine).join("\n"),
          });
          return;
        }
        node.arguments.slice(1).forEach((a) => visit(a, [...stack, title], skipped));
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, stack, skip));
  };
  visit(sf, [], false);
  return tests;
}

const normalise = (line) => {
  const t = line.trim();
  return t.length >= 8 && !/^[\W_]+$/.test(t) ? t : null;
};
const bodyLines = (body) => body.split("\n").slice(1).map(normalise).filter(Boolean);
const printable = (title) => title.replaceAll(HOLE, "${…}");

function overlap(oldBody, newBody) {
  const before = bodyLines(oldBody);
  if (!before.length) {
    return 0;
  }
  const after = new Set(bodyLines(newBody));
  return before.filter((l) => after.has(l)).length / before.length;
}

function e2eScope(ts, root, mergeBase, changed) {
  const specs = changed.filter((c) => E2E_SPEC_RE.test(c.path) || (c.from && E2E_SPEC_RE.test(c.from)));
  const before = new Map();
  const after = new Map();
  for (const c of specs) {
    if (c.status !== "A" && c.from) {
      before.set(c.from, parseSpecTests(ts, c.from, showAt(root, mergeBase, c.from)));
    }
    if (c.status !== "D") {
      after.set(c.path, parseSpecTests(ts, c.path, readWorking(root, c.path)));
    }
  }
  const renamedTo = new Map(specs.filter((c) => c.status === "R").map((c) => [c.from, c.path]));
  const afterByTitle = new Map();
  for (const [spec, tests] of after) {
    for (const t of tests) {
      if (!afterByTitle.has(t.title)) {
        afterByTitle.set(t.title, []);
      }
      afterByTitle.get(t.title).push({ spec, ...t });
    }
  }
  const beforeTitles = new Set([...before.values()].flatMap((ts_) => ts_.map((t) => t.title)));
  const added = [...after].flatMap(([spec, tests]) =>
    tests.filter((t) => !beforeTitles.has(t.title)).map((t) => ({ spec, ...t })),
  );

  const removed = [];
  for (const [spec, tests] of before) {
    const sameSpec = renamedTo.get(spec) ?? spec;
    for (const t of tests) {
      const id = `${spec}::${printable(t.title)}`;
      const matches = afterByTitle.get(t.title) ?? [];
      const kept = matches.find((m) => m.spec === sameSpec) ?? matches[0];
      const base = {
        id,
        spec,
        title: printable(t.title),
        it: printable(t.own),
        lines_at_merge_base: [t.line, t.endLine],
        skipped_at_merge_base: t.skip,
      };
      if (kept) {
        const keptLines = new Set(bodyLines(kept.body));
        const gone = t.body.split("\n").filter((l) => normalise(l) && !keptLines.has(normalise(l)));
        const goneAssertions = gone.filter((l) => ASSERTION_RE.test(l)).map((l) => l.trim());
        if (goneAssertions.length) {
          removed.push({
            ...base,
            fate: kept.spec === sameSpec ? "shrunk" : `moved to ${kept.spec} and shrunk`,
            removed_assertions: goneAssertions,
            body_at_merge_base: t.body,
          });
        }
        continue;
      }
      const successor = added
        .map((a) => ({ a, share: overlap(t.body, a.body) }))
        .filter((x) => x.share >= 0.5)
        .sort((x, y) => y.share - x.share)[0];
      removed.push({
        ...base,
        fate: "deleted",
        ...(successor && {
          possibly_merged_into: `${successor.a.spec}::${printable(successor.a.title)}`,
          share_of_lines_kept: Number(successor.share.toFixed(2)),
        }),
        removed_assertions: t.body
          .split("\n")
          .filter((l) => ASSERTION_RE.test(l))
          .map((l) => l.trim()),
        body_at_merge_base: t.body,
      });
    }
  }
  return {
    removed,
    added_e2e_tests: added.map((a) => `${a.spec}::${printable(a.title)}`),
  };
}

function jestScope(ts, root, mergeBase, changed) {
  return changed
    .filter((c) => c.status !== "D" && JEST_SPEC_RE.test(c.path))
    .map((c) => {
      const old = new Set(
        c.status === "A" ? [] : parseSpecTests(ts, c.from, showAt(root, mergeBase, c.from)).map((t) => t.title),
      );
      const now = parseSpecTests(ts, c.path, readWorking(root, c.path));
      return {
        spec: c.path,
        status: c.status === "A" ? "new" : "changed",
        new_tests: now.filter((t) => !old.has(t.title)).map((t) => printable(t.title)),
      };
    });
}

export function parseDeftests(text) {
  if (text == null) {
    return { ns: null, tests: [] };
  }
  const lines = text.split("\n");
  const ns = text.match(/^\(ns\s+(?:\^\S+\s+)*([^\s()]+)/m)?.[1] ?? null;
  const starts = lines.map((l, i) => (l.startsWith("(") ? i + 1 : null)).filter((n) => n !== null);
  const tests = [];
  starts.forEach((start, k) => {
    const m = lines[start - 1].match(/^\((?:[\w.-]+\/)?deftest-?\s+(?:\^\S+\s+)*([^\s()[\]{}]+)/);
    if (m) {
      let end = k + 1 < starts.length ? starts[k + 1] - 1 : lines.length;
      while (end > start && !lines[end - 1].trim()) {
        end--;
      }
      tests.push({ name: m[1], lines: [start, end] });
    }
  });
  return { ns, tests };
}

export function deftestScope(root, mergeBase, changed) {
  const out = [];
  for (const c of changed.filter((x) => x.status !== "D" && DEFTEST_FILE_RE.test(x.path))) {
    const { ns, tests } = parseDeftests(readWorking(root, c.path));
    if (!ns) {
      continue;
    }
    const ranges = c.status === "A" ? null : changedLineRanges(root, mergeBase, c.path);
    const touched = tests.filter(
      (t) => !ranges || ranges.some(([s, e]) => s <= t.lines[1] && e >= t.lines[0]),
    );
    const driver = c.path.match(DRIVER_TEST_RE)?.[1] ?? null;
    const before = new Set(c.status === "A" ? [] : parseDeftests(showAt(root, mergeBase, c.from)).tests.map((t) => t.name));
    for (const t of touched) {
      out.push({ id: `${ns}/${t.name}`, ns, file: c.path, status: before.has(t.name) ? "changed" : "new", ...(driver && { driver }) });
    }
  }
  return out;
}

export const PER_SPEC_HINT_OVER = 20;

// Keeps the deleted and shrunk tests of the given e2e spec files, matched by their path at the merge base or after a move.
export function restrictToSpecs(removed, specs) {
  if (!specs?.length) {
    return removed;
  }
  const wanted = new Set(specs.map((s) => s.replace(/^\.\//, "")));
  return removed.filter((t) => wanted.has(t.spec) || [...wanted].some((w) => t.fate.startsWith(`moved to ${w}`)));
}

export function countsBySpec(removed) {
  const counts = new Map();
  for (const t of removed) {
    counts.set(t.spec, (counts.get(t.spec) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function perSpecHint(scope) {
  if (scope.specs?.length || scope.removed_tests.length <= PER_SPEC_HINT_OVER) {
    return null;
  }
  return [
    `This PR deletes or shrinks ${scope.removed_tests.length} e2e tests. If one pass can't cover them all, limit scope and run to a few spec files at a time with --spec:`,
    ...countsBySpec(scope.removed_tests).map(([spec, n]) => `  ${n}  ${spec}`),
  ].join("\n");
}

export function computeScope({ root, mergeBase, baseRef, head, branch, specs = [] }) {
  const ts = loadTypescript(root);
  const changed = changedFiles(root, mergeBase);
  const { removed, added_e2e_tests } = e2eScope(ts, root, mergeBase, changed);
  const kept = restrictToSpecs(removed, specs);
  if (specs.length && !kept.length) {
    throw new Error(`no deleted or shrunk e2e tests in ${specs.join(", ")}; the spec files with some are:\n${countsBySpec(removed).map(([spec, n]) => `  ${n}  ${spec}`).join("\n")}`);
  }
  return {
    format: 1,
    root,
    branch,
    head,
    merge_base: mergeBase,
    base_ref: baseRef,
    specs,
    removed_tests: kept,
    added_e2e_tests,
    unit: {
      jest: jestScope(ts, root, mergeBase, changed),
      deftests: deftestScope(root, mergeBase, changed),
    },
  };
}
