import { t } from "ttag";

import { formatValue } from "metabase/value-formatting";
import * as Lib from "metabase-lib";
import type { DatasetColumn, RowValue } from "metabase-types/api";

const ROWS_STAGE = 0;
const SUMMARY_STAGE = 1;
/** Below this many bars, hiding some by a threshold is not worth offering. */
const MIN_GROUPS_FOR_THRESHOLD = 5;

/** Where a picked option writes: the rows (WHERE), the summary (HAVING), or the underlying records. */
export type DrillOptionTarget = "rows" | "summary" | "records";

export type DrillOption = {
  id: string;
  target: DrillOptionTarget;
  title: string;
  detail: string;
  apply: (query: Lib.Query) => Lib.Query;
};

export type DrillMenuModel = {
  /** The clicked dimension values, e.g. ["Gizmo", "March 2025"]. */
  header: string[];
  /** The clicked measure, e.g. "Count: 523". */
  measure?: string;
  options: DrillOption[];
};

function formatPlain(value: RowValue, column: DatasetColumn): string {
  const formatted = formatValue(value, { column, jsx: false });
  return typeof formatted === "string" || typeof formatted === "number"
    ? String(formatted)
    : String(value);
}

/** The query without the stage that filters the summary. */
export function rowsOnly(query: Lib.Query): Lib.Query {
  return Lib.stageCount(query) > 1 ? rowsOnly(Lib.dropStage(query)) : query;
}

/** Counts the rows that feed the summary: every row filter, no summary. */
export function rowCountQuery(query: Lib.Query): Lib.Query {
  const rows = rowsOnly(query);
  const withoutAggregations = Lib.aggregations(rows, ROWS_STAGE).reduce(
    (next, clause) => Lib.removeClause(next, ROWS_STAGE, clause),
    rows,
  );
  const withoutBreakouts = Lib.breakouts(
    withoutAggregations,
    ROWS_STAGE,
  ).reduce(
    (next, clause) => Lib.removeClause(next, ROWS_STAGE, clause),
    withoutAggregations,
  );
  return Lib.aggregateByCount(withoutBreakouts, ROWS_STAGE);
}

function withSummaryStage(query: Lib.Query): Lib.Query {
  return Lib.stageCount(query) > SUMMARY_STAGE ? query : Lib.appendStage(query);
}

/** Keeps a later summary stage when a row filter is added underneath it. */
function addRowFilter(query: Lib.Query, clause: Lib.Filterable): Lib.Query {
  return Lib.filter(query, ROWS_STAGE, clause);
}

function sameColumn(
  queryA: Lib.Query,
  columnA: Lib.ColumnMetadata,
  queryB: Lib.Query,
  columnB: Lib.ColumnMetadata,
) {
  return (
    Lib.displayInfo(queryA, ROWS_STAGE, columnA).longDisplayName ===
    Lib.displayInfo(queryB, ROWS_STAGE, columnB).longDisplayName
  );
}

function rowOptions(
  query: Lib.Query,
  drilled: Lib.Query,
  newFilters: Lib.FilterClause[],
  labels: string[],
): DrillOption[] {
  const options: DrillOption[] = [];

  newFilters.forEach((filter, index) => {
    const label =
      labels[index] ?? Lib.displayInfo(drilled, ROWS_STAGE, filter).displayName;
    const parts = Lib.stringFilterParts(drilled, ROWS_STAGE, filter);
    const detail = Lib.displayInfo(drilled, ROWS_STAGE, filter).displayName;

    const existing = parts
      ? Lib.filters(query, ROWS_STAGE).find((candidate) => {
          const candidateParts = Lib.stringFilterParts(
            query,
            ROWS_STAGE,
            candidate,
          );
          return (
            candidateParts?.operator === "=" &&
            sameColumn(query, candidateParts.column, drilled, parts.column) &&
            !candidateParts.values.includes(parts.values[0])
          );
        })
      : undefined;
    const existingParts = existing
      ? Lib.stringFilterParts(query, ROWS_STAGE, existing)
      : null;

    if (existing && existingParts && parts) {
      const values = [...existingParts.values, ...parts.values];
      options.push({
        id: `add-${index}`,
        target: "rows",
        title: t`Add ${label}`,
        detail: t`${Lib.displayInfo(query, ROWS_STAGE, existingParts.column).longDisplayName} is ${values.join(", ")}`,
        apply: (current) =>
          Lib.replaceClause(
            current,
            ROWS_STAGE,
            existing,
            Lib.stringFilterClause({ ...existingParts, values }),
          ),
      });
      return;
    }

    options.push({
      id: `only-${index}`,
      target: "rows",
      title: t`Only ${label}`,
      detail,
      apply: (current) => addRowFilter(current, filter),
    });
    if (parts?.operator === "=") {
      options.push({
        id: `except-${index}`,
        target: "rows",
        title: t`Everything except ${label}`,
        detail: t`${Lib.displayInfo(drilled, ROWS_STAGE, parts.column).longDisplayName} is not ${parts.values.join(", ")}`,
        apply: (current) =>
          addRowFilter(
            current,
            Lib.stringFilterClause({ ...parts, operator: "!=" }),
          ),
      });
    }
  });

  if (newFilters.length > 1) {
    options.push({
      id: "only-all",
      target: "rows",
      title: t`Only ${labels.join(" in ")}`,
      detail: t`Both conditions above`,
      apply: (current) => newFilters.reduce(addRowFilter, current),
    });
  }
  return options;
}

function summaryOptions(
  query: Lib.Query,
  column: DatasetColumn,
  value: number,
  formattedValue: string,
  markNoun: string,
): DrillOption[] {
  const summaryQuery = withSummaryStage(query);
  const target = Lib.filterableColumns(summaryQuery, SUMMARY_STAGE).find(
    (candidate) =>
      Lib.displayInfo(summaryQuery, SUMMARY_STAGE, candidate).name ===
      column.name,
  );
  if (!target) {
    return [];
  }
  const measureName = column.display_name;
  const withThreshold = (operator: ">=" | "<=") => (current: Lib.Query) => {
    const staged = withSummaryStage(current);
    // One threshold per measure and direction: a second click moves it.
    const replaced = Lib.filters(staged, SUMMARY_STAGE)
      .filter((filter) => {
        const parts = Lib.numberFilterParts(staged, SUMMARY_STAGE, filter);
        return (
          parts?.operator === operator &&
          Lib.displayInfo(staged, SUMMARY_STAGE, parts.column).name ===
            column.name
        );
      })
      .reduce(
        (next, filter) => Lib.removeClause(next, SUMMARY_STAGE, filter),
        staged,
      );
    return Lib.filter(
      withSummaryStage(replaced),
      SUMMARY_STAGE,
      Lib.numberFilterClause({ operator, column: target, values: [value] }),
    );
  };
  return [
    {
      id: "at-least",
      target: "summary",
      title: t`Only ${markNoun} at ${formattedValue} or more`,
      detail: t`${measureName} ≥ ${formattedValue}, after summarizing`,
      apply: withThreshold(">="),
    },
    {
      id: "at-most",
      target: "summary",
      title: t`Only ${markNoun} at ${formattedValue} or less`,
      detail: t`${measureName} ≤ ${formattedValue}, after summarizing`,
      apply: withThreshold("<="),
    },
  ];
}

function recordsOption(
  rowsQuery: Lib.Query,
  drill: Lib.DrillThru,
): DrillOption | undefined {
  const info = Lib.displayInfo(rowsQuery, -1, drill);
  if (info.type !== "drill-thru/underlying-records") {
    return undefined;
  }
  return {
    id: "records",
    target: "records",
    title: t`See these ${info.rowCount.toLocaleString()} ${info.tableName.toLowerCase()}`,
    detail: t`The rows behind this value`,
    apply: () => Lib.drillThru(rowsQuery, -1, undefined, drill),
  };
}

type GetDrillMenuOpts = {
  query: Lib.Query;
  clicked: Lib.ClickObject;
  /** How many bars or points the chart shows. */
  groupCount: number;
  /** What one group is called on this chart: "bars", "points"… */
  markNoun: string;
};

/**
 * The options a click on a chart offers, phrased with the clicked values.
 * Dimensions give row filters, never `<`/`>`; the measure gives a threshold
 * only when there are enough groups to hide some.
 */
export function getDrillMenu({
  query,
  clicked,
  groupCount,
  markNoun,
}: GetDrillMenuOpts): DrillMenuModel | undefined {
  const rowsQuery = rowsOnly(query);
  const drills = Lib.availableDrillThrus(
    rowsQuery,
    -1,
    undefined,
    clicked.column,
    clicked.value,
    clicked.data,
    clicked.dimensions,
  );
  const underlying = drills.find(
    (drill) =>
      Lib.displayInfo(rowsQuery, -1, drill).type ===
      "drill-thru/underlying-records",
  );

  const dimensions = (clicked.dimensions ?? []).filter(
    (dimension) => dimension.value != null,
  );
  const header = dimensions.map((dimension) =>
    formatPlain(dimension.value, dimension.column),
  );

  const options: DrillOption[] = [];
  if (underlying) {
    const drilled = Lib.drillThru(rowsQuery, -1, undefined, underlying);
    const newFilters = Lib.filters(drilled, ROWS_STAGE).slice(
      Lib.filters(rowsQuery, ROWS_STAGE).length,
    );
    options.push(...rowOptions(query, drilled, newFilters, header));
  }

  const isMeasure =
    clicked.column?.source === "aggregation" &&
    typeof clicked.value === "number";
  const formattedMeasure =
    isMeasure && clicked.column
      ? formatPlain(clicked.value ?? null, clicked.column)
      : undefined;
  if (
    clicked.column &&
    typeof clicked.value === "number" &&
    formattedMeasure &&
    groupCount >= MIN_GROUPS_FOR_THRESHOLD
  ) {
    options.push(
      ...summaryOptions(
        query,
        clicked.column,
        clicked.value,
        formattedMeasure,
        markNoun,
      ),
    );
  }

  const records = underlying ? recordsOption(rowsQuery, underlying) : undefined;
  if (records) {
    options.push(records);
  }

  if (options.length === 0) {
    return undefined;
  }
  return {
    header,
    measure:
      clicked.column && formattedMeasure
        ? `${clicked.column.display_name}: ${formattedMeasure}`
        : undefined,
    options,
  };
}
