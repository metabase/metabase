import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import {
  STAGE_INDEX,
  getBreakoutNames,
  getPivotRowNames,
  getPivotSettings,
  withExploreQuery,
} from "../ExploreBar/utils";

export type PivotWellId = "rows" | "columns" | "values";

export type PivotFieldItem =
  | { kind: "column"; column: Lib.ColumnMetadata; label: string }
  | {
      kind: "metric";
      metric: Lib.MetricMetadata | Lib.MeasureMetadata;
      label: string;
    };

export type PivotBreakoutItem = {
  clause: Lib.BreakoutClause;
  index: number;
  name: string;
  label: string;
};

export type PivotWells = {
  rows: PivotBreakoutItem[];
  columns: PivotBreakoutItem[];
  values: { clause: Lib.AggregationClause; index: number; label: string }[];
};

/** The question's summary laid out as a pivot: groupings split into rows and columns, plus values. */
export function getPivotWells(question: Question): PivotWells {
  const query = question.query();
  const breakoutNames = getBreakoutNames(query);
  const rowNames = getPivotRowNames(question);
  const breakouts = Lib.breakouts(query, STAGE_INDEX).map(
    (clause, index): PivotBreakoutItem => ({
      clause,
      index,
      name: breakoutNames[index] ?? "",
      label: Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
    }),
  );
  return {
    rows: breakouts.filter((item) => rowNames.includes(item.name)),
    columns: breakouts.filter((item) => !rowNames.includes(item.name)),
    values: Lib.aggregations(query, STAGE_INDEX).map((clause, index) => ({
      clause,
      index,
      label: Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
    })),
  };
}

/** The question showing `nextQuery` as a pivot whose rows are `rowNames`. */
export function toPivotQuestion(
  question: Question,
  nextQuery: Lib.Query,
  rowNames: string[],
): Question {
  if (Lib.breakouts(nextQuery, STAGE_INDEX).length === 0) {
    return withExploreQuery(question, nextQuery);
  }
  return question
    .setQuery(nextQuery)
    .setDisplay("pivot")
    .lockDisplay()
    .updateSettings(getPivotSettings(nextQuery, rowNames));
}

export function canDropOnWell(
  item: PivotFieldItem,
  wellId: PivotWellId,
): boolean {
  return item.kind === "column" || wellId === "values";
}

function isMeasurable(column: Lib.ColumnMetadata) {
  return (
    Lib.isNumeric(column) &&
    !Lib.isPrimaryKey(column) &&
    !Lib.isForeignKey(column) &&
    !Lib.isCoordinate(column)
  );
}

/** Where clicking a field puts it: numbers become values, everything else becomes rows. */
export function getDefaultWell(item: PivotFieldItem): PivotWellId {
  return item.kind === "metric" || isMeasurable(item.column)
    ? "values"
    : "rows";
}

function findOperator(query: Lib.Query, shortName: string) {
  return Lib.availableAggregationOperators(query, STAGE_INDEX).find(
    (operator) =>
      Lib.displayInfo(query, STAGE_INDEX, operator).shortName === shortName,
  );
}

function addValue(query: Lib.Query, item: PivotFieldItem): Lib.Query {
  if (item.kind === "metric") {
    return Lib.aggregate(query, STAGE_INDEX, item.metric);
  }
  const operator = findOperator(
    query,
    isMeasurable(item.column) ? "sum" : "distinct",
  );
  return operator
    ? Lib.aggregate(
        query,
        STAGE_INDEX,
        Lib.aggregationClause(operator, item.column),
      )
    : query;
}

/** A pivot needs something to show, so the first grouping comes with a count. */
function withCountIfEmpty(query: Lib.Query): Lib.Query {
  const count = findOperator(query, "count");
  return Lib.aggregations(query, STAGE_INDEX).length === 0 && count
    ? Lib.aggregate(query, STAGE_INDEX, Lib.aggregationClause(count))
    : query;
}

/** Adds a field to a well; `null` when the well doesn't take that kind of field. */
export function addToWell(
  question: Question,
  wellId: PivotWellId,
  item: PivotFieldItem,
): Question | null {
  if (!canDropOnWell(item, wellId)) {
    return null;
  }
  const query = question.query();
  const rowNames = getPivotRowNames(question);
  if (wellId === "values") {
    return toPivotQuestion(question, addValue(query, item), rowNames);
  }
  if (item.kind !== "column") {
    return null;
  }

  const groupedQuery = withCountIfEmpty(
    Lib.breakout(
      query,
      STAGE_INDEX,
      Lib.withDefaultBucket(query, STAGE_INDEX, item.column),
    ),
  );
  const addedName = getBreakoutNames(groupedQuery).at(-1);
  const nextRowNames =
    wellId === "rows" && addedName != null
      ? [...rowNames, addedName]
      : rowNames;
  return toPivotQuestion(question, groupedQuery, nextRowNames);
}

/** Moves a grouping between rows and columns. */
export function moveBreakout(
  question: Question,
  name: string,
  wellId: "rows" | "columns",
): Question {
  const rowNames = getPivotRowNames(question).filter(
    (rowName) => rowName !== name,
  );
  return toPivotQuestion(
    question,
    question.query(),
    wellId === "rows" ? [...rowNames, name] : rowNames,
  );
}

/** Applies a change to a clause (like a removal or a new date unit) and keeps the layout. */
export function updatePivotQuery(
  question: Question,
  nextQuery: Lib.Query,
): Question {
  return toPivotQuestion(question, nextQuery, getPivotRowNames(question));
}
