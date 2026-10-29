import type { EditorView } from "@tiptap/pm/view";
import { t } from "ttag";

import type { ValueAndLabel } from "../KeyboardFilterRow/value-widgets";

import type { FilterSchema, SchemaField, SchemaOperator } from "./schema";

/** The attributes of a filter pill. Values are raw, like "FR" for France. */
export type PillAttrs = {
  columnKey: string;
  operatorKey: string;
  values: string[];
};

export type AiStatus = "loading" | "done" | "error";

/** Known values of each field, by field key, filled as popovers load them. */
export type KnownValues = Map<string, ValueAndLabel[]>;

export type LogicOp = "AND" | "OR" | "(" | ")";

export const AI_PREFIX = "/";

/**
 * A ProseMirror node, typed through the editor view so that it matches the
 * editor's own copy of prosemirror-model.
 */
export type PMNode = EditorView["state"]["doc"];

// ---------- Splitting text into drafts and connectors ----------

export type Part = {
  kind: "text" | "logic";
  start: number;
  end: number;
  op?: LogicOp;
};

const LOGIC_REGEX = /"[^"]*"?|\(|\)|\b(?:and|or)\b/gi;

/**
 * Splits a run of text into connectors (and, or, parentheses) and the text
 * between them, including empty runs. Quoted strings are never split. An
 * "and" that joins the two values of a range, like "between 10 and 20", is
 * part of the text.
 */
export function splitText(
  text: string,
  schema?: FilterSchema,
  knownValues?: KnownValues,
): Part[] {
  const parts: Part[] = [];
  const regex = new RegExp(LOGIC_REGEX);
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const token = match[0];
    if (token.startsWith('"')) {
      continue;
    }
    const op = token.toUpperCase();
    // A word at the very end may still be the start of a value, like "And"
    // for "Andorra", so it's a connector once something follows it.
    const isWord = op === "AND" || op === "OR";
    if (isWord && match.index + token.length === text.length) {
      continue;
    }
    if (
      op === "AND" &&
      schema != null &&
      isOpenRange(text.slice(last, match.index), schema, knownValues)
    ) {
      continue;
    }
    parts.push({ kind: "text", start: last, end: match.index });
    parts.push({
      kind: "logic",
      start: match.index,
      end: match.index + token.length,
      op: op === "AND" || op === "OR" ? op : token === "(" ? "(" : ")",
    });
    last = match.index + token.length;
  }
  parts.push({ kind: "text", start: last, end: text.length });
  return parts;
}

/** True for a range filter with its first value only, like "Total between 10". */
function isOpenRange(
  text: string,
  schema: FilterSchema,
  knownValues?: KnownValues,
) {
  const parsed = parseDraft(text.trim(), schema, knownValues);
  return (
    parsed.op?.isRange === true &&
    parsed.values.length === 1 &&
    !/\band\b/i.test(parsed.valueText)
  );
}

// ---------- Drafts ----------

/**
 * One run of free text, in document positions. `start` and `end` include the
 * surrounding whitespace, `from` and `to` don't.
 */
export type Draft = {
  start: number;
  end: number;
  from: number;
  to: number;
  text: string;
};

export function draftsIn(
  doc: PMNode,
  schema: FilterSchema,
  knownValues?: KnownValues,
): Draft[] {
  const drafts: Draft[] = [];
  doc.firstChild?.forEach((node, offset) => {
    if (!node.isText || !node.text) {
      return;
    }
    const nodeText = node.text;
    const base = 1 + offset;
    splitText(nodeText, schema, knownValues)
      .filter((part) => part.kind === "text")
      .forEach((part) => {
        const raw = nodeText.slice(part.start, part.end);
        const lead = raw.length - raw.trimStart().length;
        const text = raw.trim();
        drafts.push({
          start: base + part.start,
          end: base + part.end,
          from: base + part.start + lead,
          to: base + part.start + lead + text.length,
          text,
        });
      });
  });
  return drafts;
}

/** The draft at the caret, or an empty draft when the caret is between pills. */
export function draftAt(
  doc: PMNode,
  pos: number,
  schema: FilterSchema,
  knownValues?: KnownValues,
): Draft {
  return (
    draftsIn(doc, schema, knownValues).find(
      (draft) => draft.start <= pos && pos <= draft.end,
    ) ?? { start: pos, end: pos, from: pos, to: pos, text: "" }
  );
}

// ---------- Parsing a draft ----------

/**
 * True when `text` has `alias` at `at`, as whole words. Symbol aliases like
 * ">" need no word boundary, so "total >100" parses.
 */
export function wordPrefix(text: string, at: number, alias: string) {
  if (!text.startsWith(alias, at)) {
    return false;
  }
  const next = text[at + alias.length];
  if (next === undefined || !/\w$/.test(alias)) {
    return true;
  }
  return !/\w/.test(next);
}

export type Parsed = {
  text: string;
  isAi: boolean;
  field?: SchemaField;
  fieldEnd: number;
  op?: SchemaOperator;
  opStart: number;
  opEnd: number;
  valueStart: number;
  /** The text after the operator. */
  valueText: string;
  /** The values, raw, like "FR" for "France". */
  values: string[];
};

function longestMatch<T>(
  items: T[],
  getAliases: (item: T) => string[],
  text: string,
  at: number,
): { item: T; length: number } | undefined {
  let best: { item: T; length: number } | undefined;
  items.forEach((item) =>
    getAliases(item).forEach((alias) => {
      if (
        wordPrefix(text, at, alias) &&
        (best == null || alias.length > best.length)
      ) {
        best = { item, length: alias.length };
      }
    }),
  );
  return best;
}

function skipSpaces(text: string, at: number) {
  let index = at;
  while (text[index] === " ") {
    index++;
  }
  return index;
}

export function parseDraft(
  text: string,
  schema: FilterSchema,
  knownValues?: KnownValues,
): Parsed {
  const parsed: Parsed = {
    text,
    isAi: text.startsWith(AI_PREFIX),
    fieldEnd: 0,
    opStart: 0,
    opEnd: 0,
    valueStart: 0,
    valueText: "",
    values: [],
  };
  if (parsed.isAi) {
    return parsed;
  }
  const lower = text.toLowerCase();

  const field = longestMatch(schema.fields, (field) => field.aliases, lower, 0);
  if (field == null) {
    return parsed;
  }
  parsed.field = field.item;
  parsed.fieldEnd = field.length;

  const opStart = skipSpaces(lower, field.length);
  parsed.opStart = opStart;
  const op = longestMatch(
    field.item.operators ?? [],
    (op) => op.aliases,
    lower,
    opStart,
  );
  if (op == null) {
    return parsed;
  }
  parsed.op = op.item;
  parsed.opEnd = opStart + op.length;

  const valueStart = skipSpaces(lower, parsed.opEnd);
  parsed.valueStart = valueStart;
  parsed.valueText = text.slice(valueStart).trim();
  parsed.values = parseValues(
    parsed.valueText,
    field.item,
    op.item,
    knownValues,
  );
  return parsed;
}

const RANGE_SEPARATOR = /\s+and\s+|\s*\.\.\s*|\s+to\s+|\s+-\s+/i;

/** Splits on commas that are not inside quotes. */
function splitList(text: string) {
  const items: string[] = [];
  let current = "";
  let isQuoted = false;
  for (const char of text) {
    if (char === '"') {
      isQuoted = !isQuoted;
    }
    if (char === "," && !isQuoted) {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  items.push(current);
  return items;
}

function unquote(text: string) {
  return text.trim().replace(/^"|"$/g, "").trim();
}

export function parseValues(
  valueText: string,
  field: SchemaField,
  op: SchemaOperator,
  knownValues?: KnownValues,
): string[] {
  if (!op.needsValue || valueText.length === 0) {
    return [];
  }
  const items = op.isMulti
    ? splitList(valueText)
    : op.isRange
      ? valueText.split(RANGE_SEPARATOR)
      : [valueText];
  return items
    .map(unquote)
    .filter((item) => item.length > 0)
    .map((item) => resolveValue(item, field, op, knownValues));
}

/** The raw value for a typed value: "France" is "FR", "paid" is "Paid". */
export function resolveValue(
  typed: string,
  field: SchemaField,
  op: SchemaOperator,
  knownValues?: KnownValues,
) {
  const lower = typed.toLowerCase();
  const option = op.draft.options?.find(
    ({ value, label }) =>
      value.toLowerCase() === lower || label.toLowerCase() === lower,
  );
  if (option != null) {
    return option.value;
  }
  const known = knownValues
    ?.get(field.key)
    ?.find(([value, label]) =>
      [value, label, op.draft.formatValue?.(value) ?? value].some(
        (text) => text.toLowerCase() === lower,
      ),
    );
  return known != null ? known[0] : typed;
}

/** The label of a raw value, like "France" for "FR". */
export function getValueLabel(
  value: string,
  field: SchemaField,
  op: SchemaOperator,
  knownValues?: KnownValues,
) {
  const option = op.draft.options?.find((option) => option.value === value);
  if (option != null) {
    return option.label;
  }
  const formatted = op.draft.formatValue?.(value);
  if (formatted != null) {
    return formatted;
  }
  const known = knownValues
    ?.get(field.key)
    ?.find(([knownValue]) => knownValue === value);
  return known?.[1] ?? value;
}

export function isComplete(parsed: Parsed) {
  const { field, op, values } = parsed;
  if (field == null || op == null) {
    return false;
  }
  if (!op.needsValue) {
    return parsed.valueText.length === 0;
  }
  if (op.isRange && values.length !== 2) {
    return false;
  }
  return (
    values.length > 0 &&
    (op.isMulti || op.isRange || values.length === 1) &&
    values.every((value) => isValidDraftValue(op, value))
  );
}

function isValidDraftValue(op: SchemaOperator, value: string) {
  if (op.draft.options != null) {
    return op.draft.options.some((option) => option.value === value);
  }
  return !op.draft.isNumeric || Number.isFinite(Number(value));
}

export function attrsOf(parsed: Parsed): PillAttrs | undefined {
  const { field, op } = parsed;
  if (field == null || op == null || !isComplete(parsed)) {
    return undefined;
  }
  return { columnKey: field.key, operatorKey: op.key, values: parsed.values };
}

// ---------- Stage under the caret ----------

export type Stage =
  | "empty"
  | "ai"
  | "field"
  | "picker"
  | "operator"
  | "value"
  | "done";

/** The part of the draft that the caret is on. `caret` is relative to the draft. */
export function stageOf(parsed: Parsed, caret: number): Stage {
  if (!parsed.text) {
    return "empty";
  }
  if (parsed.isAi) {
    return "ai";
  }
  if (parsed.field == null || caret <= parsed.fieldEnd) {
    return "field";
  }
  if (parsed.field.operators == null) {
    return "picker";
  }
  if (parsed.op == null || caret <= parsed.opEnd) {
    return "operator";
  }
  return parsed.op.needsValue ? "value" : "done";
}

// ---------- Pill text ----------

function quoteIfNeeded(text: string, isMulti: boolean) {
  const needsQuotes =
    /[()"]|\b(and|or)\b/i.test(text) || (isMulti && text.includes(","));
  return needsQuotes ? `"${text.replace(/"/g, "")}"` : text;
}

/** The text of the values, as the user would type them. */
export function valuesText(
  values: string[],
  field: SchemaField,
  op: SchemaOperator,
  knownValues?: KnownValues,
) {
  const labels = values.map((value) =>
    quoteIfNeeded(getValueLabel(value, field, op, knownValues), op.isMulti),
  );
  return labels.join(op.isRange ? ` ${t`and`} ` : ", ");
}

/** The text that a pill turns back into when it is unwrapped for editing. */
export function pillText(
  attrs: PillAttrs,
  schema: FilterSchema,
  knownValues?: KnownValues,
) {
  const field = schema.getField(attrs.columnKey);
  const op = schema.getOperator(field, attrs.operatorKey);
  if (field == null || op == null) {
    return "";
  }
  if (!op.needsValue) {
    return `${field.text} ${op.label}`;
  }
  return `${field.text} ${op.label} ${valuesText(attrs.values, field, op, knownValues)}`;
}

// ---------- Tokens and validation ----------

export type Token =
  | { kind: "filter"; attrs: PillAttrs; pos: number }
  | { kind: "clause"; clauseId: string; pos: number }
  | { kind: "ai"; aiId: string; status: AiStatus; pos: number }
  | { kind: "logic"; op: LogicOp }
  | { kind: "text"; text: string };

export function tokensOf(
  doc: PMNode,
  schema: FilterSchema,
  knownValues?: KnownValues,
): Token[] {
  const tokens: Token[] = [];
  doc.firstChild?.forEach((node, offset) => {
    const pos = 1 + offset;
    if (node.type.name === "filterPill") {
      tokens.push({
        kind: "filter",
        attrs: {
          columnKey: node.attrs.columnKey,
          operatorKey: node.attrs.operatorKey,
          values: node.attrs.values,
        },
        pos,
      });
    } else if (node.type.name === "clausePill") {
      tokens.push({ kind: "clause", clauseId: node.attrs.clauseId, pos });
    } else if (node.type.name === "aiPill") {
      tokens.push({
        kind: "ai",
        aiId: node.attrs.aiId,
        status: node.attrs.status,
        pos,
      });
    } else if (node.isText && node.text) {
      const nodeText = node.text;
      splitText(nodeText, schema, knownValues).forEach((part) => {
        const text = nodeText.slice(part.start, part.end).trim();
        if (part.kind === "logic" && part.op != null) {
          tokens.push({ kind: "logic", op: part.op });
        } else if (text) {
          tokens.push({ kind: "text", text });
        }
      });
    }
  });
  return tokens;
}

/** The problems that keep the bar from applying, in reading order. */
export function validate(tokens: Token[]): string[] {
  const errors: string[] = [];
  let expectOperand = true;
  let openCount = 0;
  tokens.forEach((token) => {
    if (token.kind !== "logic") {
      if (!expectOperand) {
        errors.push(t`Add AND or OR between two filters`);
      }
      if (token.kind === "text") {
        errors.push(t`“${token.text}” isn't a complete filter`);
      }
      if (token.kind === "ai" && token.status === "loading") {
        errors.push(t`The AI is still working`);
      }
      if (token.kind === "ai" && token.status === "error") {
        errors.push(t`An AI prompt found no filter`);
      }
      expectOperand = false;
    } else if (token.op === "(") {
      if (!expectOperand) {
        errors.push(t`Add AND or OR before “(”`);
      }
      openCount++;
      expectOperand = true;
    } else if (token.op === ")") {
      if (expectOperand) {
        errors.push(t`“)” must follow a filter`);
      }
      if (openCount > 0) {
        openCount--;
      } else {
        errors.push(t`“)” has no matching “(”`);
      }
      expectOperand = false;
    } else {
      if (expectOperand) {
        errors.push(t`${token.op} must follow a filter or “)”`);
      }
      expectOperand = true;
    }
  });
  if (tokens.length > 0 && expectOperand) {
    errors.push(t`The filters end with AND, OR or “(”`);
  }
  if (openCount > 0) {
    errors.push(t`A “(” is not closed`);
  }
  return [...new Set(errors)];
}

// ---------- Expression tree ----------

export type Expr<Leaf> =
  | { kind: "leaf"; leaf: Leaf }
  | { kind: "and" | "or"; args: Expr<Leaf>[] };

export type ExprToken<Leaf> =
  | { kind: "logic"; op: LogicOp }
  | { kind: "leaf"; leaf: Leaf };

/**
 * The tree of a valid token list, where AND binds tighter than OR:
 * `a or b and c` is `a or (b and c)`. Runs of the same connector are flat.
 * Returns null for an empty list.
 */
export function buildExpression<Leaf>(
  tokens: ExprToken<Leaf>[],
): Expr<Leaf> | null {
  let index = 0;
  const peekOp = () => {
    const token = tokens[index];
    return token?.kind === "logic" ? token.op : undefined;
  };

  const parseBinary = (
    op: "AND" | "OR",
    parseOperand: () => Expr<Leaf> | null,
  ): Expr<Leaf> | null => {
    const first = parseOperand();
    if (first == null) {
      return null;
    }
    const args = [first];
    while (peekOp() === op) {
      index++;
      const next = parseOperand();
      if (next == null) {
        break;
      }
      args.push(next);
    }
    if (args.length === 1) {
      return first;
    }
    const kind = op === "AND" ? "and" : "or";
    return {
      kind,
      args: args.flatMap((arg) => (arg.kind === kind ? arg.args : [arg])),
    };
  };

  const parsePrimary = (): Expr<Leaf> | null => {
    const token = tokens[index];
    if (token == null) {
      return null;
    }
    if (token.kind === "leaf") {
      index++;
      return token;
    }
    if (token.op === "(") {
      index++;
      const inner = parseOr();
      if (peekOp() === ")") {
        index++;
      }
      return inner;
    }
    return null;
  };

  const parseAnd = () => parseBinary("AND", parsePrimary);
  const parseOr = (): Expr<Leaf> | null => parseBinary("OR", parseAnd);

  return parseOr();
}

/** The top-level AND operands, each one a filter of its own in the query. */
export function getTopLevelOperands<Leaf>(
  expr: Expr<Leaf> | null,
): Expr<Leaf>[] {
  if (expr == null) {
    return [];
  }
  return expr.kind === "and" ? expr.args : [expr];
}
