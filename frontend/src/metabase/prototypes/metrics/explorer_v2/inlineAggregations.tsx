import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  skipToken,
  useCreateMeasureMutation,
  useListDatabasesQuery,
  useListTablesQuery,
  useUpdateMeasureMutation,
} from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import type { Measure, MeasureId, TableId } from "metabase-types/api";

import {
  type AggregationOperator,
  LoadTable,
  buildDefinition,
} from "./MissingMeasures";
import { type BarItem, DRAFT_PREFIX, matchesItem } from "./TokenBar";
import { COLUMNS, MEASURE_COLUMNS, MEASURE_TABLES } from "./catalog";

/**
 * An aggregation typed straight into the bar, like `Sum(Orders.Total)`, with
 * no measure saved for it. Its pill id is `agg:Orders:sum:Total`.
 */
export type InlineAggregation = {
  table: string;
  operator: AggregationOperator;
  column?: string;
};

export const AGG_PREFIX = "agg:";

/**
 * The metric API runs saved measures only, so each inline aggregation gets a
 * measure behind it, marked by its description and kept out of the picker.
 */
const BACKING_PREFIX = "prototype:inline:";

const OPERATORS: { operator: AggregationOperator; label: string }[] = [
  { operator: "sum", label: "Sum" },
  { operator: "avg", label: "Average" },
];

export const aggregationId = ({ table, operator, column }: InlineAggregation) =>
  `${AGG_PREFIX}${table}:${operator}${column ? `:${column}` : ""}`;

export function parseAggregation(id: string): InlineAggregation | null {
  if (!id.startsWith(AGG_PREFIX)) {
    return null;
  }
  const [table, operator, column] = id.slice(AGG_PREFIX.length).split(":");
  const known = OPERATORS.find((option) => option.operator === operator);
  if (operator === "count") {
    return { table, operator };
  }
  return known && column ? { table, operator: known.operator, column } : null;
}

export const isAggregationId = (id: string) => parseAggregation(id) != null;

/** `Count(Orders)`, `Sum(Orders.Total)`. */
export function aggregationName({
  table,
  operator,
  column,
}: InlineAggregation) {
  const label =
    OPERATORS.find((option) => option.operator === operator)?.label ?? "Count";
  return column ? `${label}(${table}.${column})` : `${label}(${table})`;
}

/** "Average of Total in Orders", "Count of rows in Orders". */
export function describeAggregation({
  table,
  operator,
  column,
}: InlineAggregation) {
  const label =
    OPERATORS.find((option) => option.operator === operator)?.label ?? "Count";
  return column
    ? `${label} of ${column} in ${table}`
    : `Count of rows in ${table}`;
}

/** The saved measure that is the same aggregation, like Revenue for Sum(Orders.Total). */
export function equivalentMeasure({
  table,
  operator,
  column,
}: InlineAggregation): string | undefined {
  if (operator === "avg") {
    return undefined;
  }
  return Object.keys(MEASURE_TABLES).find(
    (name) =>
      MEASURE_TABLES[name] === table && MEASURE_COLUMNS[name] === column,
  );
}

const TABLES = [
  ...new Set(COLUMNS.filter(({ via }) => via == null).map((c) => c.table)),
];

/**
 * Count of each catalog table, and sum and average of its number columns,
 * each noting the saved measure it duplicates among `savedNames`.
 */
export const aggregationItems = (savedNames: readonly string[]): BarItem[] =>
  TABLES.flatMap((table) => {
    const numbers = COLUMNS.filter(
      (column) =>
        column.table === table &&
        column.via == null &&
        column.kind === "number",
    );
    const aggregations: InlineAggregation[] = [
      { table, operator: "count" },
      ...numbers.flatMap((column) =>
        OPERATORS.map(({ operator }) => ({
          table,
          operator,
          column: column.column,
        })),
      ),
    ];
    return aggregations.map((aggregation): BarItem => {
      const equivalent = equivalentMeasure(aggregation);
      const same =
        equivalent && savedNames.includes(equivalent) ? equivalent : undefined;
      return {
        id: aggregationId(aggregation),
        label: aggregationName(aggregation),
        icon: "sum",
        description: same ? `Same as ${same}` : undefined,
        aliases: [
          aggregation.operator,
          ...(aggregation.operator === "avg" ? ["average"] : []),
          `${aggregation.operator} ${aggregation.column ?? table}`,
        ],
        info: "Calculated right here. Save it as a measure to reuse it in other metrics.",
        section: "New aggregation",
        sectionIcon: "sum",
      };
    });
  });

const SECTION = "New aggregation";

/** Step one: the aggregation; picking one types `Sum(` and lists what to sum. */
const OPERATOR_STEPS: BarItem[] = [
  {
    id: `${DRAFT_PREFIX}Count(`,
    label: "Count",
    description: "rows of a table",
    aliases: ["rows"],
  },
  {
    id: `${DRAFT_PREFIX}Sum(`,
    label: "Sum",
    description: "of a column",
    aliases: ["total"],
  },
  {
    id: `${DRAFT_PREFIX}Avg(`,
    label: "Average",
    description: "of a column",
    aliases: ["avg", "mean"],
  },
].map((item) => ({
  ...item,
  icon: "sum",
  info: "Calculated right here. Save it as a measure to reuse it in other metrics.",
  section: SECTION,
  sectionIcon: "sum",
}));

const STEP_PATTERN = /^\s*(count|sum|avg|average)\s*\(\s*([^)]*)\)?\s*$/i;

/**
 * Two steps instead of every table and column at once: the aggregations for
 * the typed text, then, once it reads `Sum(`, the columns (tables for Count)
 * to aggregate, grouped by table. `items` are from `aggregationItems`.
 */
export function aggregationSuggestions(
  items: BarItem[],
  query: string,
): BarItem[] {
  const match = STEP_PATTERN.exec(query);
  if (match == null) {
    return OPERATOR_STEPS.filter((item) => matchesItem(item, query));
  }
  const typed = match[1].toLowerCase();
  const operator = typed === "average" ? "avg" : typed;
  return items
    .flatMap((item): BarItem[] => {
      const aggregation = parseAggregation(item.id);
      if (aggregation == null || aggregation.operator !== operator) {
        return [];
      }
      const { table, column } = aggregation;
      return [
        column == null
          ? {
              ...item,
              label: table,
              icon: "table",
              aliases: [],
              section: "Count rows of",
              sectionIcon: "table",
            }
          : {
              ...item,
              label: column,
              icon: "int",
              aliases: [`${table}.${column}`],
              section: table,
              sectionIcon: "table",
            },
      ];
    })
    .filter((item) => matchesItem(item, match[2]));
}

/** Every inline aggregation, to name and resolve a pill. */
export const AGGREGATION_ITEMS = aggregationItems([]);

export const isBackingMeasure = (measure: Pick<Measure, "description">) =>
  measure.description?.startsWith(BACKING_PREFIX) ?? false;

/** The Sample Database's tables, to name a measure's table by its id. */
export function useSampleTables() {
  const { data: databases } = useListDatabasesQuery();
  const sample = databases?.data.find((database) => database.is_sample);
  const { data: tables = [] } = useListTablesQuery(
    sample ? { dbId: sample.id } : skipToken,
  );
  const tableName = useCallback(
    (tableId: TableId) =>
      tables.find((table) => table.id === tableId)?.display_name,
    [tables],
  );
  return { sample, tables, tableName };
}

/**
 * The measures behind the draft's inline aggregations: creates the missing
 * ones, and turns one into a named measure on "Save as measure".
 */
export function useInlineAggregations(measures: Measure[], ids: string[]) {
  const { sample, tables } = useSampleTables();
  const provider = useMetadataProvider(sample?.id ?? null);
  const [createMeasure] = useCreateMeasureMutation();
  const [updateMeasure] = useUpdateMeasureMutation();
  const pending = useRef(new Set<string>());

  const backing = useMemo(
    () =>
      new Map(
        measures
          .filter((measure) => !measure.archived && isBackingMeasure(measure))
          .map((measure) => [
            measure.description?.slice(BACKING_PREFIX.length) ?? "",
            measure.id,
          ]),
      ),
    [measures],
  );

  const tableOf = useCallback(
    (name: string) =>
      // The list isn't narrowed to one database, and others have a People too.
      tables.find(
        (table) => table.db_id === sample?.id && table.display_name === name,
      ),
    [tables, sample],
  );

  const missing = ids.filter((id) => !backing.has(id));
  const missingKey = missing.join("|");
  const needed = [
    ...new Set(
      missing.flatMap((id) => {
        const aggregation = parseAggregation(id);
        return (aggregation && tableOf(aggregation.table)?.id) ?? [];
      }),
    ),
  ];

  useEffect(() => {
    for (const id of missing) {
      const aggregation = parseAggregation(id);
      const table = aggregation && tableOf(aggregation.table);
      const definition =
        table &&
        buildDefinition(
          provider,
          table,
          aggregation.operator,
          aggregation.column,
        );
      if (!aggregation || !definition || pending.current.has(id)) {
        continue;
      }
      pending.current.add(id);
      createMeasure({
        name: aggregationName(aggregation),
        definition,
        description: `${BACKING_PREFIX}${id}`,
      }).finally(() => pending.current.delete(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on what's missing
  }, [missingKey, provider, tableOf, createMeasure]);

  /** The saved measure an inline aggregation runs as, once it exists. */
  const sourceOf = useCallback(
    (id: string) => {
      const measureId = backing.get(id);
      return measureId != null ? `measure:${measureId}` : null;
    },
    [backing],
  );

  /** Names the measure behind it, so the picker lists it like any other. */
  const saveAsMeasure = async (
    id: string,
    name: string,
  ): Promise<MeasureId | null> => {
    const measureId = backing.get(id);
    const aggregation = parseAggregation(id);
    if (measureId == null || aggregation == null) {
      return null;
    }
    // Replacing the marker; an empty description fails the metric API's schema.
    const result = await updateMeasure({
      id: measureId,
      name,
      description: describeAggregation(aggregation),
      revision_message: "Saved from the metric editor",
    });
    return result.error ? null : measureId;
  };

  return {
    sourceOf,
    saveAsMeasure,
    loaders: needed.map((tableId) => <LoadTable key={tableId} id={tableId} />),
  };
}
