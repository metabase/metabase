import { t } from "ttag";
import * as ML from "cljs/metabase.lib.js";
import { format_unit } from "cljs/metabase.shared.util.time";
import type { RowValue } from "metabase-types/api";

import { isDate } from "../column_types";

import type {
  ColumnMetadata,
  ClickObjectDataRow,
  ClickObjectDimension,
  DrillThru,
  ExpressionClause,
  Query,
} from "../types";


export function columnExtractDrill(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | undefined,
  value: RowValue | undefined,
  row: ClickObjectDataRow[] | undefined,
  dimensions: ClickObjectDimension[] | undefined,
): DrillThru|null {
  // This only applies to a header click: value is undefined (not null) and column is defined.
  // Also the column must be a date or datetime.
  // TODO: This does not currently work when an extra stage is necessary, eg. when the column in question is an
  // aggregation. (This needs the equivalent of metabase.lib.drill-thru.column-filter/prepare-query-for-drill-addition,
  // but that's tightly coupled and should probably get rolled into eg. lib/expression, lib/filter, etc.)
  if (column && typeof value === "undefined" && isDate(column)) {
    return {
      type: "drill-thru/column-extract",
      displayName: t`(TS) Extract day, month…`, // HACK: Remove the "(TS)" from the name.
      extractions: ["hour-of-day", "day-of-month", "day-of-week", "month-of-year", "quarter-of-year", "year",]
          .map(unit => ({ key: unit, displayName: ML.describe_temporal_unit(1, unit), })),
      column,
      query,
      stageNumber: stageIndex,
    };
  }
  return null;
}

function caseExpression(exprFactory: () => ExpressionClause, unit: string, count: number): ExpressionClause {
  const cases = [];
  for (let i = 1; i <= count ; i++) {
    cases.push([
      // Check: Inner expression (eg. the month number) = i
      ML.expression_clause("=", [exprFactory(), i], {}),
      // Value: The human label for that part.
      format_unit(i, unit),
    ]);
  }
  return ML.expression_clause("case", [cases, ""], {});
}

function columnExtractExpression(column: ColumnMetadata, unit: string): ExpressionClause {
  switch (unit) {
    case "hour-of-day": return ML.expression_clause("get-hour", [column], {});
    case "day-of-month": return ML.expression_clause("get-day", [column], {});
    case "day-of-week": return caseExpression(() => ML.expression_clause("get-day-of-week", [column], {}), unit, 7);
    case "month-of-year": return caseExpression(() => ML.expression_clause("get-month", [column], {}), unit, 12);
    case "quarter-of-year": return caseExpression(() => ML.expression_clause("get-quarter", [column], {}), unit, 4);
    case "year": return ML.expression_clause("get-year", [column], {});
    default: throw new Error("Unknown unit " + unit + "in column extraction");
  }
}

export function applyColumnExtract(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru & {type: string, column: ColumnMetadata},
  ...args: unknown[]
): Query {
  const [unit] = args;
  const expression = columnExtractExpression(drillThru.column, unit);
  // TODO: This does not make the names unique; that should be rolled into `lib/expression`.
  const expressionName = ML.describe_temporal_unit(1, unit);
  return ML.expression(query, stageIndex, expressionName, expression);
}
