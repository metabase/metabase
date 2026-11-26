import { FILTERS, MEASURES, getMeasure } from "../data";

import { type BarItem, matchesItem } from "./TokenBar";
import type { DimensionMapping } from "./dimensions";
import type { PanelMapping } from "./panelModel";

export type Op = "+" | "−" | "×" | "÷";

export type FormulaToken =
  | { key: string; kind: "term"; measureId: string; filters: string[] }
  | { key: string; kind: "op"; op: Op }
  | { key: string; kind: "paren"; side: "(" | ")" };

export type WhereToken = { key: string; filter: string };

export type MetricDraft = {
  name: string;
  formula: FormulaToken[];
  where: WhereToken[];
  /** The author's changes to which dimensions the metric has. */
  mapping: DimensionMapping;
  /** The author's changes to the metric's real dimensions, from the panel. */
  panel: PanelMapping;
};

export const OP_ITEMS: { op: Op; label: string; keys: string }[] = [
  { op: "+", label: "Add", keys: "+" },
  { op: "−", label: "Subtract", keys: "-" },
  { op: "×", label: "Multiply", keys: "*" },
  { op: "÷", label: "Divide", keys: "/" },
];

export const KEY_TO_OP: Record<string, Op> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

export const toOp = (value: string): Op =>
  OP_ITEMS.find(({ op }) => op === value)?.op ?? "+";

let nextKey = 100;
export const newKey = () => String(nextKey++);

export const endsOperand = (token?: FormulaToken) =>
  token?.kind === "term" || (token?.kind === "paren" && token.side === ")");
export const startsOperand = (token?: FormulaToken) =>
  token?.kind === "term" || (token?.kind === "paren" && token.side === "(");

/** Puts an operand at the caret, adding `+` where it would touch another one. */
export function insertOperand(
  tokens: FormulaToken[],
  caret: number,
  operand: FormulaToken,
) {
  const before = endsOperand(tokens[caret - 1])
    ? [{ key: newKey(), kind: "op", op: "+" } as const]
    : [];
  const after = startsOperand(tokens[caret])
    ? [{ key: newKey(), kind: "op", op: "+" } as const]
    : [];
  const next = [
    ...tokens.slice(0, caret),
    ...before,
    operand,
    ...after,
    ...tokens.slice(caret),
  ];
  return { tokens: next, caret: caret + before.length + 1 };
}

/** Puts an operator at the caret, replacing an operator right next to it. */
export function insertOp(tokens: FormulaToken[], caret: number, op: Op) {
  const token = { key: newKey(), kind: "op", op } as const;
  if (tokens[caret - 1]?.kind === "op") {
    return { tokens: tokens.with(caret - 1, token), caret };
  }
  if (tokens[caret]?.kind === "op") {
    return { tokens: tokens.with(caret, token), caret: caret + 1 };
  }
  if (!endsOperand(tokens[caret - 1])) {
    return { tokens, caret };
  }
  const next = [...tokens.slice(0, caret), token, ...tokens.slice(caret)];
  return { tokens: next, caret: caret + 1 };
}

const combine = (a: number[], op: Op, b: number[]) =>
  a.map((x, i) => {
    const y = b[i];
    switch (op) {
      case "+":
        return x + y;
      case "−":
        return x - y;
      case "×":
        return x * y;
      case "÷":
        return y === 0 ? 0 : x / y;
    }
  });

/** Monthly values of the definition, or null while it doesn't parse. */
export function evaluate(
  draft: Pick<MetricDraft, "formula" | "where">,
): number[] | null {
  const tokens = draft.formula;
  let i = 0;
  const opAt = (ops: Op[]) => {
    const token = tokens[i];
    return token?.kind === "op" && ops.includes(token.op) ? token.op : null;
  };

  const factor = (): number[] | null => {
    const token = tokens[i];
    if (token?.kind === "term") {
      i++;
      return getMeasure(token.measureId).series.map(
        (value) => value * Math.pow(0.7, token.filters.length),
      );
    }
    if (token?.kind === "paren" && token.side === "(") {
      i++;
      const inner = expr();
      const close = tokens[i];
      if (inner == null || close?.kind !== "paren" || close.side !== ")") {
        return null;
      }
      i++;
      return inner;
    }
    return null;
  };

  const binary = (
    operand: () => number[] | null,
    ops: Op[],
  ): number[] | null => {
    let left = operand();
    let op = opAt(ops);
    while (left != null && op != null) {
      i++;
      const right = operand();
      left = right == null ? null : combine(left, op, right);
      op = opAt(ops);
    }
    return left;
  };

  const term = () => binary(factor, ["×", "÷"]);
  const expr = (): number[] | null => binary(term, ["+", "−"]);

  const result = expr();
  if (i !== tokens.length || result == null) {
    return null;
  }
  return result.map((value) => value * Math.pow(0.85, draft.where.length));
}

export type FormulaProblem = { message: string; keys: string[] };

const defaultName = (id: string) => getMeasure(id).name;

const describeToken = (token: FormulaToken, nameOf = defaultName) =>
  token.kind === "term"
    ? nameOf(token.measureId)
    : token.kind === "op"
      ? token.op
      : "the group";

/**
 * What is wrong with the definition, for the error under the bar. Problems
 * at the end, like `Revenue −` while the next measure is still to come, are
 * left to `isComplete`, so typing never flashes an error.
 */
export function findProblem(
  tokens: FormulaToken[],
  nameOf = defaultName,
): FormulaProblem | null {
  const open: FormulaToken[] = [];
  for (const [index, token] of tokens.entries()) {
    const before = tokens[index - 1];
    if (startsOperand(token) && endsOperand(before) && before != null) {
      return {
        message: `Add an operator between ${describeToken(before, nameOf)} and ${describeToken(token, nameOf)}.`,
        keys: [before.key, token.key],
      };
    }
    if (token.kind === "op" && !endsOperand(before)) {
      return {
        message:
          before?.kind === "op"
            ? `Add a measure between ${before.op} and ${token.op}.`
            : `Add a measure before ${token.op}.`,
        keys: before?.kind === "op" ? [before.key, token.key] : [token.key],
      };
    }
    if (token.kind === "paren" && token.side === "(") {
      open.push(token);
    }
    if (token.kind === "paren" && token.side === ")") {
      if (open.pop() == null) {
        return { message: "This ) has no matching (.", keys: [token.key] };
      }
      if (!endsOperand(before)) {
        return {
          message: "Add a measure before ) to finish the group.",
          keys: [token.key],
        };
      }
    }
  }
  return null;
}

export const isComplete = (tokens: FormulaToken[]) =>
  tokens.length > 0 && evaluate({ formula: tokens, where: [] }) != null;

/** "Sum of Total" in Orders → "Sum of the Total column in Orders". */
const describeAggregation = (aggregation: string, table: string) => {
  const match = aggregation.match(/^(.+) of (.+)$/);
  return match
    ? `${match[1]} of the ${match[2]} column in ${table}`
    : `${aggregation} of rows in ${table}`;
};

export const MEASURE_ITEMS: BarItem[] = MEASURES.toSorted((a, b) =>
  a.table.localeCompare(b.table),
).map((measure) => ({
  id: measure.id,
  label: measure.name,
  icon: "ruler",
  aliases: [measure.aggregation],
  info: describeAggregation(measure.aggregation, measure.table),
  section: measure.table,
  sectionIcon: "table",
}));

export const FILTER_ITEMS: BarItem[] = FILTERS.map((filter): BarItem => {
  const isSegment = filter.startsWith("Segment: ");
  return {
    id: filter,
    label: isSegment ? filter.slice("Segment: ".length) : filter,
    icon: isSegment ? "segment" : "filter",
    section: isSegment ? "Segments" : "Filters",
  };
}).toSorted((a, b) => (a.section ?? "").localeCompare(b.section ?? ""));

export const OP_OPTIONS: BarItem[] = OP_ITEMS.map(({ op, label, keys }) => ({
  id: op,
  label,
  hint: op,
  aliases: [op, keys],
}));

/** The bottom section of the dropdown, like the filter bar's AND, OR, ( and ). */
export const LOGIC_OPTIONS: {
  key: string;
  label: string;
  description: string;
}[] = [
  { key: "+", label: "+", description: "Add" },
  { key: "-", label: "−", description: "Subtract" },
  { key: "*", label: "×", description: "Multiply" },
  { key: "/", label: "÷", description: "Divide" },
  { key: "(", label: "(", description: "Start a group" },
  { key: ")", label: ")", description: "End the group" },
];

export const search = (
  items: BarItem[],
  query: string,
  exclude: string[] = [],
) =>
  items.filter(
    (item) => !exclude.includes(item.id) && matchesItem(item, query),
  );
