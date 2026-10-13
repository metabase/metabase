import { getClauseDefinition } from "metabase/querying/expressions";
import { formatIdentifier } from "metabase/querying/expressions/identifier";
import * as Lib from "metabase-lib";

import {
  findFormulaColumn,
  tableFormulaColumns,
  tableFormulaReferences,
} from "./table-formula";

/** Aggregations offered by a block's function picker, in menu order. */
export const BLOCK_FUNCTIONS = [
  "sum",
  "avg",
  "count",
  "distinct",
  "min",
  "max",
] as const;
export type BlockFunction = (typeof BLOCK_FUNCTIONS)[number];

export const BLOCK_OPERATORS = [
  { operator: "+", symbol: "+" },
  { operator: "-", symbol: "−" },
  { operator: "*", symbol: "×" },
  { operator: "/", symbol: "÷" },
] as const;
export type BlockOperator = (typeof BLOCK_OPERATORS)[number]["operator"];

/** The formula name of a function, such as `Average` for `avg`. */
export function getFunctionDisplayName(name: string): string {
  return getClauseDefinition(name)?.displayName ?? name;
}

/** Resolves a typed function name such as `AVG` or `Average` to its clause. */
export function getBlockFunction(name: string): BlockFunction | undefined {
  const target = name.toLowerCase();
  return BLOCK_FUNCTIONS.find(
    (fn) =>
      fn === target || getFunctionDisplayName(fn).toLowerCase() === target,
  );
}

/** Columns a function can take, in table order. */
export function getBlockColumns(
  query: Lib.Query,
  fn: BlockFunction,
): Lib.ColumnMetadata[] {
  const columns = tableFormulaColumns(query);
  switch (fn) {
    case "count":
      return [];
    case "sum":
    case "avg":
      return columns.filter((column) => Lib.isNumeric(column));
    case "min":
    case "max":
      return columns.filter(
        (column) => Lib.isNumeric(column) || Lib.isTemporal(column),
      );
    case "distinct":
      return columns;
  }
}

/** The column a function starts with: the first non-ID number, if any. */
export function getDefaultBlockColumn(
  query: Lib.Query,
  fn: BlockFunction,
): Lib.ColumnMetadata | undefined {
  const columns = getBlockColumns(query, fn);
  return (
    columns.find((column) => Lib.isNumeric(column) && !Lib.isID(column)) ??
    columns[0]
  );
}

/**
 * The column a call should use after switching to `fn`: the typed column when
 * the new function accepts it, otherwise the function's default column.
 */
export function getColumnForFunction(
  query: Lib.Query,
  fn: BlockFunction,
  typedColumnName: string | undefined,
): Lib.ColumnMetadata | undefined {
  const columns = getBlockColumns(query, fn);
  const typed =
    typedColumnName != null
      ? findFormulaColumn(query, columns, typedColumnName)
      : undefined;
  return typed ?? getDefaultBlockColumn(query, fn);
}

/** A replacement of `from..to` in the formula text. */
export type FormulaEdit = { from: number; to: number; insert: string };

type CallSpan = {
  from: number;
  to: number;
  columns: readonly { from: number; to: number; label: string }[];
};

function formatColumnReference(
  query: Lib.Query,
  column: Lib.ColumnMetadata | undefined,
) {
  return column
    ? formatIdentifier(Lib.displayInfo(query, -1, column).displayName)
    : "";
}

/** Formula text for a new call, using the function's default column. */
export function getCallSource(query: Lib.Query, fn: BlockFunction): string {
  const column =
    fn === "count" ? undefined : getColumnForFunction(query, fn, undefined);
  return `${getFunctionDisplayName(fn)}(${formatColumnReference(query, column)})`;
}

export type FormulaReference = { name: string; source: string };

/** Saved metrics and measures with the formula text that references them. */
export function getFormulaReferences(query: Lib.Query): FormulaReference[] {
  return tableFormulaReferences(query).map((reference) => {
    const { displayName } = Lib.isMetricMetadata(reference)
      ? Lib.displayInfo(query, -1, reference)
      : Lib.displayInfo(query, -1, reference);
    return { name: displayName, source: formatIdentifier(displayName) };
  });
}

/** Rewrites a call to use `fn`, keeping its column when `fn` accepts it. */
export function getFunctionEdit(
  query: Lib.Query,
  call: CallSpan,
  fn: BlockFunction,
): FormulaEdit {
  const column =
    fn === "count"
      ? undefined
      : getColumnForFunction(query, fn, call.columns[0]?.label);
  return {
    from: call.from,
    to: call.to,
    insert: `${getFunctionDisplayName(fn)}(${formatColumnReference(query, column)})`,
  };
}

/** Replaces one column reference of a call. */
export function getColumnEdit(
  query: Lib.Query,
  call: CallSpan,
  columnIndex: number,
  column: Lib.ColumnMetadata,
): FormulaEdit | null {
  const target = call.columns[columnIndex];
  return target
    ? {
        from: target.from,
        to: target.to,
        insert: formatColumnReference(query, column),
      }
    : null;
}

export function applyFormulaEdit(
  source: string,
  { from, to, insert }: FormulaEdit,
): string {
  return source.slice(0, from) + insert + source.slice(to);
}
