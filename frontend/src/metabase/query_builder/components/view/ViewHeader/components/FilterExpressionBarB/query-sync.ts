import type { JSONContent } from "@tiptap/core";

import * as Lib from "metabase-lib";

import {
  getDraftFilterClause,
  getDraftStateFromFilter,
} from "../KeyboardFilterRow/utils";

import {
  type AiStatus,
  type Expr,
  type KnownValues,
  type PillAttrs,
  type Token,
  buildExpression,
  getTopLevelOperands,
  withImplicitAnd,
} from "./parser";
import type { FilterSchema } from "./schema";

export type BarClause = Lib.FilterClause | Lib.ExpressionClause;

/** A filter the bar shows as an opaque pill, like a date filter or a segment. */
export type ClauseEntry = {
  clause: BarClause | Lib.SegmentMetadata;
  label: string;
};

export type AiEntry = {
  prompt: string;
  status: AiStatus;
  filters: Lib.ExpressionClause[];
  /** The filters as pill attributes, or clause ids for the ones that are not. */
  items: PillItem[];
  summary?: string;
  error?: string;
};

/**
 * The objects that pills refer to by id, because they don't fit in the
 * attributes of a node: query clauses and AI answers.
 */
export type BarStore = {
  clauses: Map<string, ClauseEntry>;
  ai: Map<string, AiEntry>;
  knownValues: KnownValues;
};

let nextId = 1;
export const newId = (prefix: string) => `${prefix}${nextId++}`;

export function createBarStore(): BarStore {
  return { clauses: new Map(), ai: new Map(), knownValues: new Map() };
}

export function addClause(
  store: BarStore,
  query: Lib.Query,
  stageIndex: number,
  clause: BarClause | Lib.SegmentMetadata,
) {
  const id = newId("clause");
  const label = Lib.isSegmentMetadata(clause)
    ? Lib.displayInfo(query, stageIndex, clause).displayName
    : Lib.displayInfo(query, stageIndex, clause).displayName;
  store.clauses.set(id, { clause, label });
  return id;
}

/** The column of a simple filter, like the column of a date filter. */
export function getClauseColumn(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.Filterable,
): Lib.ColumnMetadata | undefined {
  const parts =
    Lib.stringFilterParts(query, stageIndex, clause) ??
    Lib.numberFilterParts(query, stageIndex, clause) ??
    Lib.coordinateFilterParts(query, stageIndex, clause) ??
    Lib.booleanFilterParts(query, stageIndex, clause) ??
    Lib.specificDateFilterParts(query, stageIndex, clause) ??
    Lib.relativeDateFilterParts(query, stageIndex, clause) ??
    Lib.excludeDateFilterParts(query, stageIndex, clause) ??
    Lib.timeFilterParts(query, stageIndex, clause) ??
    Lib.defaultFilterParts(query, stageIndex, clause);
  return parts?.column;
}

// ---------- Query → document ----------

type InlineNode = JSONContent;

function textNode(text: string): InlineNode {
  return { type: "text", text };
}

export type PillItem = { attrs: PillAttrs } | { clauseId: string };

/** A pill for a simple filter, or an opaque clause pill. */
export function getPillItem(
  query: Lib.Query,
  stageIndex: number,
  clause: BarClause | Lib.SegmentMetadata,
  schema: FilterSchema,
  store: BarStore,
): PillItem {
  const draft = Lib.isSegmentMetadata(clause)
    ? undefined
    : getDraftStateFromFilter(query, stageIndex, clause);
  const field =
    draft?.column != null ? schema.findField(draft.column.column) : undefined;
  const op = schema.getOperator(field, draft?.operator?.key);
  if (draft != null && field != null && op != null) {
    return {
      attrs: {
        columnKey: field.key,
        operatorKey: op.key,
        values: draft.values,
      },
    };
  }
  return { clauseId: addClause(store, query, stageIndex, clause) };
}

export function getPillItemJson(item: PillItem): InlineNode {
  return "attrs" in item
    ? { type: "filterPill", attrs: item.attrs }
    : { type: "clausePill", attrs: { clauseId: item.clauseId } };
}

export function getPillNode(
  query: Lib.Query,
  stageIndex: number,
  clause: BarClause | Lib.SegmentMetadata,
  schema: FilterSchema,
  store: BarStore,
): InlineNode {
  return getPillItemJson(getPillItem(query, stageIndex, clause, schema, store));
}

function emitFilter(
  query: Lib.Query,
  stageIndex: number,
  clause: BarClause,
  isNested: boolean,
  schema: FilterSchema,
  store: BarStore,
  out: InlineNode[],
) {
  const parts = Lib.expressionParts(query, stageIndex, clause);
  const isCompound = parts.operator === "and" || parts.operator === "or";
  const args = isCompound ? parts.args.filter(Lib.isExpressionParts) : [];
  if (!isCompound || args.length !== parts.args.length) {
    out.push(getPillNode(query, stageIndex, clause, schema, store));
    return;
  }
  if (isNested) {
    out.push(textNode("("));
  }
  args.forEach((arg, index) => {
    if (index > 0) {
      out.push(textNode(` ${parts.operator} `));
    }
    emitFilter(
      query,
      stageIndex,
      Lib.expressionClause(arg),
      true,
      schema,
      store,
      out,
    );
  });
  if (isNested) {
    out.push(textNode(")"));
  }
}

/** The bar's content for the filters of a stage. */
export function docFromQuery(
  query: Lib.Query,
  stageIndex: number,
  schema: FilterSchema,
  store: BarStore,
): JSONContent {
  const filters = Lib.filters(query, stageIndex);
  const content: InlineNode[] = [];
  filters.forEach((filter, index) => {
    if (index > 0) {
      // Version B: filters next to each other are joined with an implicit AND.
      content.push(textNode(" "));
    }
    // An OR group next to other filters needs parentheses.
    emitFilter(
      query,
      stageIndex,
      filter,
      filters.length > 1,
      schema,
      store,
      content,
    );
  });
  if (content.length > 0) {
    content.push(textNode(" "));
  }
  return {
    type: "doc",
    content: [
      content.length > 0
        ? { type: "paragraph", content }
        : { type: "paragraph" },
    ],
  };
}

// ---------- Document → query ----------

type Leaf = Array<BarClause | Lib.SegmentMetadata>;

function getLeaf(
  token: Token,
  schema: FilterSchema,
  store: BarStore,
): Leaf | undefined {
  if (token.kind === "filter") {
    const field = schema.getField(token.attrs.columnKey);
    const op = schema.getOperator(field, token.attrs.operatorKey);
    const clause =
      op != null
        ? getDraftFilterClause({
            operator: op.draft,
            values: token.attrs.values,
          })
        : undefined;
    return clause != null ? [clause] : undefined;
  }
  if (token.kind === "clause") {
    const entry = store.clauses.get(token.clauseId);
    return entry != null ? [entry.clause] : undefined;
  }
  if (token.kind === "ai") {
    const entry = store.ai.get(token.aiId);
    return entry?.status === "done" && entry.filters.length > 0
      ? entry.filters
      : undefined;
  }
  return undefined;
}

function toClause(expr: Expr<Leaf>): BarClause | undefined {
  if (expr.kind === "leaf") {
    const clauses = expr.leaf.filter(
      (clause): clause is BarClause => !Lib.isSegmentMetadata(clause),
    );
    if (clauses.length !== expr.leaf.length) {
      return undefined;
    }
    return clauses.length === 1
      ? clauses[0]
      : Lib.expressionClause("and", clauses);
  }
  const args = expr.args.map(toClause);
  return args.every((arg) => arg != null)
    ? Lib.expressionClause(
        expr.kind,
        args.filter((arg) => arg != null),
      )
    : undefined;
}

/**
 * The filters of a valid token list, each one a top-level filter of the
 * stage, or undefined when a pill can't become a filter, like a segment
 * inside an OR group.
 */
export function getFiltersFromTokens(
  tokens: Token[],
  schema: FilterSchema,
  store: BarStore,
): Array<BarClause | Lib.SegmentMetadata> | undefined {
  const exprTokens = [];
  for (const token of withImplicitAnd(tokens)) {
    if (token.kind === "logic") {
      exprTokens.push(token);
    } else {
      const leaf = getLeaf(token, schema, store);
      if (leaf == null) {
        return undefined;
      }
      exprTokens.push({ kind: "leaf" as const, leaf });
    }
  }
  const operands = getTopLevelOperands(buildExpression<Leaf>(exprTokens));
  const filters: Array<BarClause | Lib.SegmentMetadata> = [];
  for (const operand of operands) {
    if (operand.kind === "leaf") {
      filters.push(...operand.leaf);
    } else {
      const clause = toClause(operand);
      if (clause == null) {
        return undefined;
      }
      filters.push(clause);
    }
  }
  return filters;
}

/** The query with the filters of the stage replaced. */
export function getQueryWithFilters(
  query: Lib.Query,
  stageIndex: number,
  filters: Array<BarClause | Lib.SegmentMetadata>,
): Lib.Query {
  const withoutFilters = Lib.filters(query, stageIndex).reduce(
    (newQuery, filter) => Lib.removeClause(newQuery, stageIndex, filter),
    query,
  );
  const withFilters = filters.reduce(
    (newQuery, filter) => Lib.filter(newQuery, stageIndex, filter),
    withoutFilters,
  );
  return Lib.dropEmptyStages(withFilters);
}
