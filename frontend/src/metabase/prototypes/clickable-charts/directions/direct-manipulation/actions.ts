import { t } from "ttag";

import { dayjs } from "metabase/dayjs";
import * as Lib from "metabase-lib";

const ROWS_STAGE = 0;
const SUMMARY_STAGE = 1;

type XKind = "temporal" | "numeric" | "string";
type XUnit = "day" | "week" | "month" | "quarter" | "year";

/** What the chart's x-axis is, as far as building filters on it goes. */
export type XDimension = {
  kind: XKind;
  /** Stage-0 column to filter the rows on (unbucketed). */
  column: Lib.ColumnMetadata;
  unit: XUnit;
  /** e.g. "Created At". */
  name: string;
  /** Plural noun for the slots, e.g. "months", "categories". */
  noun: string;
};

export function getXDimension(query: Lib.Query): XDimension | undefined {
  const breakout = Lib.breakouts(query, ROWS_STAGE)[0];
  const bucketed = breakout
    ? Lib.breakoutColumn(query, ROWS_STAGE, breakout)
    : null;
  if (!breakout || !bucketed) {
    return undefined;
  }
  const column = Lib.withBinning(Lib.withTemporalBucket(bucketed, null), null);
  const bucket = Lib.temporalBucket(breakout);
  const unitName = bucket
    ? Lib.displayInfo(query, ROWS_STAGE, bucket).shortName
    : undefined;
  const kind: XKind = Lib.isTemporal(column)
    ? "temporal"
    : Lib.isNumeric(column)
      ? "numeric"
      : "string";
  const unit = isPlainUnit(unitName) ? unitName : "day";
  return {
    kind,
    column,
    unit,
    name: Lib.displayInfo(query, ROWS_STAGE, column).displayName,
    noun:
      kind === "temporal"
        ? `${unit}s`
        : Lib.displayInfo(query, ROWS_STAGE, column).displayName.toLowerCase() +
          t` values`,
  };
}

function isPlainUnit(unit: string | undefined): unit is XUnit {
  return ["day", "week", "month", "quarter", "year"].includes(unit ?? "");
}

export function getMeasureName(query: Lib.Query): string | undefined {
  const aggregation = Lib.aggregations(query, ROWS_STAGE)[0];
  return aggregation
    ? Lib.displayInfo(query, ROWS_STAGE, aggregation).displayName
    : undefined;
}

/** A date at local midnight, from whatever the chart holds (ISO or ms). */
function toLocalDate(value: unknown): Date {
  const iso =
    typeof value === "number" ? new Date(value).toISOString() : String(value);
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function endOfBucket(start: Date, unit: XDimension["unit"]): Date {
  const next =
    unit === "quarter"
      ? dayjs(start).add(3, "month")
      : dayjs(start).add(1, unit);
  return next.subtract(1, "day").toDate();
}

export function formatX(value: unknown, x: XDimension): string {
  if (x.kind !== "temporal") {
    return String(value);
  }
  const formats: Record<string, string> = {
    year: "YYYY",
    quarter: "MMM YYYY",
    month: "MMM YYYY",
  };
  return dayjs(toLocalDate(value)).format(formats[x.unit] ?? "MMM D, YYYY");
}

export function formatRange(
  first: unknown,
  last: unknown,
  x: XDimension,
): string {
  const from = formatX(first, x);
  const to = formatX(last, x);
  return from === to ? from : `${from} – ${to}`;
}

/** The step between two x slots, for numeric bins. */
function binWidth(values: unknown[]): number {
  const numbers = values.map(Number).sort((a, b) => a - b);
  const gaps = numbers.slice(1).map((n, i) => n - numbers[i]);
  return gaps.length > 0 ? Math.min(...gaps.filter((gap) => gap > 0)) : 0;
}

/** A filter matching rows from `first` through `last` (both slots inclusive). */
function rangeClause(
  first: unknown,
  last: unknown,
  x: XDimension,
  allValues: unknown[],
): Lib.ExpressionClause {
  if (x.kind === "temporal") {
    return Lib.specificDateFilterClause({
      operator: "between",
      column: x.column,
      values: [toLocalDate(first), endOfBucket(toLocalDate(last), x.unit)],
      hasTime: false,
    });
  }
  return Lib.numberFilterClause({
    operator: "between",
    column: x.column,
    values: [Number(first), Number(last) + binWidth(allValues)],
  });
}

/** Rows that fall in any of `values`' slots. */
function slotsClause(
  values: unknown[],
  x: XDimension,
  allValues: unknown[],
): Lib.ExpressionClause {
  if (x.kind === "string") {
    return Lib.stringFilterClause({
      operator: "=",
      column: x.column,
      values: values.map(String),
      options: {},
    });
  }
  const clauses = values.map((value) =>
    rangeClause(value, value, x, allValues),
  );
  return clauses.length === 1
    ? clauses[0]
    : Lib.expressionClause("or", clauses);
}

export function onlyRange(
  query: Lib.Query,
  x: XDimension,
  selected: unknown[],
  allValues: unknown[],
): Lib.Query {
  return Lib.filter(
    query,
    ROWS_STAGE,
    x.kind === "string"
      ? slotsClause(selected, x, allValues)
      : rangeClause(selected[0], selected.at(-1), x, allValues),
  );
}

export function excludeRange(
  query: Lib.Query,
  x: XDimension,
  selected: unknown[],
  allValues: unknown[],
): Lib.Query {
  const clause =
    x.kind === "string"
      ? Lib.stringFilterClause({
          operator: "!=",
          column: x.column,
          values: selected.map(String),
          options: {},
        })
      : Lib.expressionClause("not", [
          rangeClause(selected[0], selected.at(-1), x, allValues),
        ]);
  return Lib.filter(query, ROWS_STAGE, clause);
}

/** The brush filter the app already has: filters and picks a finer unit. */
export function zoomIn(
  query: Lib.Query,
  x: XDimension,
  selected: unknown[],
  allValues: unknown[],
): Lib.Query {
  const first = selected[0];
  const last = selected.at(-1);
  if (x.kind === "temporal") {
    return Lib.updateTemporalFilter(
      query,
      ROWS_STAGE,
      x.column,
      undefined,
      toLocalDate(first),
      endOfBucket(toLocalDate(last), x.unit),
    );
  }
  return Lib.updateNumericFilter(
    query,
    ROWS_STAGE,
    x.column,
    undefined,
    Number(first),
    Number(last) + binWidth(allValues),
  );
}

/** The underlying rows of `selected`'s slots, as a plain table. */
export function seeRows(
  query: Lib.Query,
  x: XDimension,
  selected: unknown[],
  allValues: unknown[],
  isRange: boolean,
): Lib.Query {
  let rows = query;
  while (Lib.stageCount(rows) > 1) {
    rows = Lib.dropStage(rows);
  }
  while (Lib.aggregations(rows, ROWS_STAGE).length > 0) {
    rows = Lib.removeClause(
      rows,
      ROWS_STAGE,
      Lib.aggregations(rows, ROWS_STAGE)[0],
    );
  }
  while (Lib.breakouts(rows, ROWS_STAGE).length > 0) {
    rows = Lib.removeClause(
      rows,
      ROWS_STAGE,
      Lib.breakouts(rows, ROWS_STAGE)[0],
    );
  }
  return isRange
    ? onlyRange(rows, x, selected, allValues)
    : Lib.filter(rows, ROWS_STAGE, slotsClause(selected, x, allValues));
}

export type CutOperator = ">=" | "<=";

/** A cut on the dimension: this slot and everything after (or before) it. */
export function cutX(
  query: Lib.Query,
  x: XDimension,
  operator: CutOperator,
  value: unknown,
  kept: unknown[],
): Lib.Query {
  if (x.kind === "string") {
    return Lib.filter(query, ROWS_STAGE, slotsClause(kept, x, kept));
  }
  if (x.kind === "temporal") {
    const start = toLocalDate(value);
    const clause =
      operator === ">="
        ? Lib.specificDateFilterClause({
            operator: ">",
            column: x.column,
            values: [dayjs(start).subtract(1, "day").toDate()],
            hasTime: false,
          })
        : Lib.specificDateFilterClause({
            operator: "<",
            column: x.column,
            values: [dayjs(endOfBucket(start, x.unit)).add(1, "day").toDate()],
            hasTime: false,
          });
    return Lib.filter(query, ROWS_STAGE, clause);
  }
  return Lib.filter(
    query,
    ROWS_STAGE,
    Lib.numberFilterClause({
      operator,
      column: x.column,
      values: [Number(value)],
    }),
  );
}

/** A filter on the summarized rows: lands in the bar like any filter. */
export function filterMeasure(
  query: Lib.Query,
  measureName: string,
  operator: CutOperator | "between",
  values: number[],
): Lib.Query {
  const summary =
    Lib.stageCount(query) > SUMMARY_STAGE ? query : Lib.appendStage(query);
  const column = Lib.filterableColumns(summary, SUMMARY_STAGE).find(
    (candidate) =>
      Lib.displayInfo(summary, SUMMARY_STAGE, candidate).displayName ===
      measureName,
  );
  if (!column) {
    return query;
  }
  return Lib.filter(
    summary,
    SUMMARY_STAGE,
    Lib.numberFilterClause({ operator, column, values }),
  );
}
