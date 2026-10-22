import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

/**
 * Mutant schemata: every mutant is compiled into the product file once,
 * behind `globalThis.__E2E_MUTANT__ === id`. With the global unset or 0 the
 * code is the original, so the file loads and behaves unchanged until a test
 * flips the switch.
 */

export const MUTANT_GLOBAL = "globalThis.__E2E_MUTANT__";

export type MutantKind =
  | "return-undefined"
  | "if-false"
  | "ternary-false"
  | "remove-call"
  | "jsx-prop-undefined"
  | "string-empty";

const KIND_PRIORITY: MutantKind[] = [
  "return-undefined",
  "if-false",
  "ternary-false",
  "remove-call",
  "jsx-prop-undefined",
  "string-empty",
];

export interface Mutant {
  id: number;
  file: string;
  functionLine: number;
  functionName: string;
  kind: MutantKind;
  line: number;
  start: number;
  end: number;
  description: string;
  statement: boolean;
  replacement: string;
}

/** A mutant before the planner decides to keep it and gives it an id. */
export type MutantPlan = Omit<Mutant, "id">;

export interface FunctionNode {
  node: ts.Node;
  startLine: number;
  endLine: number;
}

export function parseSource(fileName: string, text: string) {
  const kind = /\.(tsx|jsx|js)$/.test(fileName)
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
}

function isFunctionLike(node: ts.Node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

const lineOf = (sourceFile: ts.SourceFile, pos: number) =>
  sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

/**
 * The outermost function-like node that starts on the given line, which is
 * how istanbul records a function's location.
 */
export function functionAtLine(
  sourceFile: ts.SourceFile,
  line: number,
): FunctionNode | null {
  let found: ts.Node | null = null;
  const visit = (node: ts.Node) => {
    if (found) {
      return;
    }
    if (
      isFunctionLike(node) &&
      lineOf(sourceFile, node.getStart(sourceFile)) === line
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!found) {
    return null;
  }
  const node: ts.Node = found;
  return {
    node,
    startLine: line,
    endLine: lineOf(sourceFile, node.getEnd()),
  };
}

function enclosingFunction(node: ts.Node): ts.Node | null {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunctionLike(current)) {
      return current;
    }
  }
  return null;
}

const SKIPPED_JSX_PROPS = new Set([
  "key",
  "ref",
  "className",
  "style",
  "data-testid",
]);

function isConsoleCall(call: ts.CallExpression) {
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === "console"
  );
}

function isStringLiteralCandidate(node: ts.StringLiteral) {
  const parent = node.parent;
  if (node.text.length <= 1) {
    return false;
  }
  if (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isJsxAttribute(parent) ||
    ts.isCaseClause(parent) ||
    ts.isElementAccessExpression(parent) ||
    ts.isLiteralTypeNode(parent) ||
    ts.isModuleDeclaration(parent) ||
    ts.isExternalModuleReference(parent)
  ) {
    return false;
  }
  return !(ts.isPropertyAssignment(parent) && parent.name === node);
}

interface Candidate {
  kind: MutantKind;
  node: ts.Node;
  start: number;
  end: number;
  statement: boolean;
  mutated: string;
  description: string;
}

const snippet = (text: string, max = 60) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

function candidatesIn(
  sourceFile: ts.SourceFile,
  fn: FunctionNode,
): Candidate[] {
  const out: Candidate[] = [];
  const text = (node: ts.Node) => node.getText(sourceFile);
  const own = (node: ts.Node) => enclosingFunction(node) === fn.node;
  const push = (
    kind: MutantKind,
    node: ts.Node,
    mutated: string,
    description: string,
    statement = false,
  ) =>
    out.push({
      kind,
      node,
      start: node.getStart(sourceFile),
      end: node.getEnd(),
      statement,
      mutated,
      description,
    });

  const visit = (node: ts.Node) => {
    if (ts.isTypeNode(node)) {
      return;
    }
    if (node !== fn.node && isFunctionLike(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isReturnStatement(node) && node.expression && own(node)) {
      push(
        "return-undefined",
        node.expression,
        "undefined",
        `return undefined instead of \`${snippet(text(node.expression))}\``,
      );
    } else if (
      ts.isArrowFunction(node) &&
      node === fn.node &&
      !ts.isBlock(node.body)
    ) {
      push(
        "return-undefined",
        node.body,
        "undefined",
        `return undefined instead of \`${snippet(text(node.body))}\``,
      );
    } else if (ts.isIfStatement(node) && own(node)) {
      push(
        "if-false",
        node.expression,
        "false",
        `\`if (${snippet(text(node.expression))})\` never takes its then branch`,
      );
    } else if (ts.isConditionalExpression(node) && own(node)) {
      push(
        "ternary-false",
        node.condition,
        "false",
        `\`${snippet(text(node.condition))} ? … : …\` always takes its second arm`,
      );
    } else if (ts.isExpressionStatement(node) && own(node)) {
      const inner = ts.isAwaitExpression(node.expression)
        ? node.expression.expression
        : node.expression;
      if (ts.isCallExpression(inner) && !isConsoleCall(inner)) {
        push(
          "remove-call",
          node,
          "",
          `remove \`${snippet(text(node))}\``,
          true,
        );
      }
    } else if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      !SKIPPED_JSX_PROPS.has(node.name.getText(sourceFile)) &&
      own(node)
    ) {
      push(
        "jsx-prop-undefined",
        node.initializer.expression,
        "undefined",
        `prop \`${node.name.getText(sourceFile)}\` becomes undefined`,
      );
    } else if (
      ts.isStringLiteral(node) &&
      own(node) &&
      isStringLiteralCandidate(node)
    ) {
      push(
        "string-empty",
        node,
        '""',
        `string \`${snippet(node.text, 40)}\` becomes empty`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.node);
  return out;
}

/**
 * Picks up to `perFunction` mutants in one function, highest priority kind
 * first, source order within a kind. Mutants may nest, since each one wraps
 * a whole AST node.
 */
export function mutantsForFunction(
  sourceFile: ts.SourceFile,
  file: string,
  fn: FunctionNode,
  functionName: string,
  perFunction: number,
): MutantPlan[] {
  const candidates = candidatesIn(sourceFile, fn).sort(
    (a, b) =>
      KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind) ||
      a.start - b.start,
  );
  const chosen: MutantPlan[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= perFunction) {
      break;
    }
    chosen.push({
      file,
      functionLine: fn.startLine,
      functionName,
      kind: candidate.kind,
      line: lineOf(sourceFile, candidate.start),
      start: candidate.start,
      end: candidate.end,
      description: candidate.description,
      statement: candidate.statement,
      replacement: candidate.mutated,
    });
  }
  return chosen;
}

function wrap(mutant: Mutant, original: string) {
  return mutant.statement
    ? `if (${MUTANT_GLOBAL} !== ${mutant.id}) { ${original} }`
    : `(${MUTANT_GLOBAL} === ${mutant.id} ? ${mutant.replacement} : (${original}))`;
}

/**
 * Rewrites the source so every mutant sits behind its switch. Mutants nest
 * but never partially overlap, because each one wraps a whole AST node, so
 * the text is rebuilt outside in with each mutant's original text containing
 * its already-wrapped children.
 */
export function applySchemata(text: string, mutants: Mutant[]) {
  const ordered = [...mutants].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const build = (start: number, end: number, inRange: Mutant[]): string => {
    let out = "";
    let cursor = start;
    for (let index = 0; index < inRange.length; ) {
      const mutant = inRange[index];
      let next = index + 1;
      while (next < inRange.length && inRange[next].start < mutant.end) {
        next++;
      }
      out += text.slice(cursor, mutant.start);
      out += wrap(
        mutant,
        build(mutant.start, mutant.end, inRange.slice(index + 1, next)),
      );
      cursor = mutant.end;
      index = next;
    }
    return out + text.slice(cursor, end);
  };
  return build(0, text.length, ordered);
}

export function writeSchemata(
  repoRoot: string,
  file: string,
  mutants: Mutant[],
) {
  const absolute = path.join(repoRoot, file);
  const text = fs.readFileSync(absolute, "utf8");
  fs.writeFileSync(absolute, applySchemata(text, mutants));
}

/**
 * Deals planned mutants one round at a time, so every function gets its first
 * mutant before any function gets a second, and assigns the ids of the ones
 * that fit the budget. Spending the budget four at a time measures fewer
 * functions than one each: with 209 functions and 300 mutants it leaves two
 * thirds of them unmeasured.
 *
 * The entries arrive rarest first, so within a round the functions that are
 * most specific to the deleted test are served first.
 */
export function dealMutants<T>(
  planned: [T, MutantPlan[]][],
  perFunction: number,
  maxMutants: number,
): [T, Mutant[]][] {
  const dealt = new Map<T, Mutant[]>(planned.map(([key]) => [key, []]));
  let nextId = 1;
  for (let round = 0; round < perFunction; round++) {
    for (const [key, plans] of planned) {
      const plan = plans[round];
      if (!plan || nextId > maxMutants) {
        continue;
      }
      dealt.get(key)?.push({ ...plan, id: nextId++ });
    }
  }
  return [...dealt].filter(([, mutants]) => mutants.length > 0);
}

/**
 * Splits the functions worth mutating from the ones other test suites own.
 *
 * The boot threshold drops what nearly every e2e test fires. What is left
 * still holds shared screen furniture, such as the admin navbar at about 18%
 * of the suite, which the deleted test only booted through. Mutating that
 * spends the budget on code this branch is not responsible for, and breaking
 * it makes its own spec fail for reasons the report then has to explain.
 */
export function splitByShare<T extends { e2eShare: number }>(
  functions: T[],
  ceiling: number,
): { mutate: T[]; shared: T[] } {
  const mutate: T[] = [];
  const shared: T[] = [];
  for (const fn of functions) {
    (fn.e2eShare < ceiling ? mutate : shared).push(fn);
  }
  return { mutate, shared };
}
