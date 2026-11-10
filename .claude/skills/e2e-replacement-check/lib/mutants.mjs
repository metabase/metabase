import { OPERATORS, configure, parse } from "./operators.mjs";
import { syntaxErrors } from "./breaks.mjs";

const PER_FILE_OPERATOR = 3;
const MUTANT_FILE_RE = /\.(ts|tsx|js|jsx)$/;

const snippet = (s, n = 60) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1) + "…" : flat;
};

function armCandidates(ts, file) {
  const { sf } = parse(file);
  const out = [];
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const push = (node, edit, description) =>
    out.push({
      operator: "arm",
      file,
      line: lineOf(node.getStart()),
      end_line: lineOf(node.getEnd()),
      description,
      priority: 2,
      edit,
    });
  const visit = (node) => {
    if (ts.isIfStatement(node)) {
      const kept = node.elseStatement;
      push(
        node,
        { start: node.getStart(), end: node.getEnd(), replacement: kept ? kept.getText() : "{}" },
        `\`if (${snippet(node.expression.getText())})\` never takes its then branch`,
      );
    } else if (ts.isConditionalExpression(node)) {
      push(
        node,
        { start: node.getStart(), end: node.getEnd(), replacement: `(${node.whenFalse.getText()})` },
        `\`${snippet(node.condition.getText())} ? … : …\` always takes its second arm`,
      );
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      ts.isJsxExpression(node.parent)
    ) {
      push(
        node,
        { start: node.getStart(), end: node.getEnd(), replacement: "false" },
        `\`${snippet(node.getText())}\` never renders`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function enclosingFunctionSpans(ts, sf, offsets) {
  const spans = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body) {
      if (offsets.some((o) => node.getStart() <= o && o < node.getEnd())) {
        spans.push([node.getStart(), node.getEnd()]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return spans;
}

// Plants mutants with the existing operators in the frontend files the breaks touched, at most `limit` in all.
// Mutants inside a function that a break edits come first, then the operators take turns.
export function planAutomaticMutants({ root, ts, breaks, limit = 25 }) {
  configure({ ts, root });
  const files = new Map();
  for (const b of breaks) {
    for (const c of b.changes) {
      if (!MUTANT_FILE_RE.test(c.file)) {
        continue;
      }
      if (!files.has(c.file)) {
        files.set(c.file, { before: c.before, offsets: [] });
      }
      for (const [startLine] of c.lines) {
        const offset = c.before
          .split("\n")
          .slice(0, startLine - 1)
          .reduce((n, line) => n + line.length + 1, 0);
        files.get(c.file).offsets.push(offset);
      }
    }
  }
  const candidates = [];
  const breakTexts = new Set(breaks.flatMap((b) => b.changes.map((c) => `${c.file}\n${c.after}`)));
  for (const [file, { before, offsets }] of files) {
    const { sf } = parse(file);
    const spans = enclosingFunctionSpans(ts, sf, offsets);
    const found = [];
    for (const [operator, generate] of Object.entries(OPERATORS)) {
      try {
        found.push(...generate(file).map((c) => ({ ...c, operator })));
      } catch {}
    }
    found.push(...armCandidates(ts, file));
    for (const c of found) {
      const after = before.slice(0, c.edit.start) + c.edit.replacement + before.slice(c.edit.end);
      if (after === before || breakTexts.has(`${file}\n${after}`)) {
        continue;
      }
      const near = spans.some(([s, e]) => s <= c.edit.start && c.edit.end <= e);
      candidates.push({ ...c, file, after, before, rank: (near ? 100 : 0) + (c.priority ?? 0) });
    }
  }
  const perKey = new Map();
  const capped = [];
  for (const c of candidates.sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line)) {
    const key = `${c.file}|${c.operator}`;
    if ((perKey.get(key) ?? 0) >= PER_FILE_OPERATOR) {
      continue;
    }
    perKey.set(key, (perKey.get(key) ?? 0) + 1);
    capped.push(c);
  }
  const near = capped.filter((c) => c.rank >= 100);
  const rest = capped.filter((c) => c.rank < 100);
  const chosen = [];
  for (const group of [near, rest]) {
    const byOperator = new Map();
    for (const c of group) {
      byOperator.set(c.operator, [...(byOperator.get(c.operator) ?? []), c]);
    }
    while (chosen.length < limit && [...byOperator.values()].some((l) => l.length)) {
      for (const list of byOperator.values()) {
        if (list.length && chosen.length < limit) {
          const c = list.shift();
          if (!syntaxErrors(ts, c.file, c.after).length) {
            chosen.push(c);
          }
        }
      }
    }
  }
  return chosen.map((c, i) => ({
    id: `auto-${i + 1}`,
    operator: c.operator,
    file: c.file,
    lines: [[c.line, c.end_line]],
    description: c.description,
    changes: [{ file: c.file, before: c.before, after: c.after, lines: [[c.line, c.end_line]] }],
  }));
}
