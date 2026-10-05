import dayjs from "dayjs";

import type { DatePickerValue } from "metabase/querying/common/types";
import type { ClickObject } from "metabase/visualizations/types";
import type { TemporalUnit } from "metabase-types/api";

/**
 * The operations the server can apply to a stored query to derive a new one.
 * The iframe names an operation; it never sends a query. Mirrors the closed
 * schema in `metabase.mcp.derive`.
 */
type McpScalar = string | number | boolean | null;

type McpCell = { column: string; value: McpScalar };

export type McpClickContext = {
  column?: string | null;
  value?: McpScalar;
  row?: McpCell[];
  dimensions?: McpCell[];
};

type McpDateFilterValue =
  | {
      type: "specific";
      operator: "=" | "<" | ">" | "between";
      values: string[];
      hasTime: boolean;
    }
  | {
      type: "relative";
      unit: string;
      value: number;
      offsetUnit?: string | null;
      offsetValue?: number | null;
      options?: { includeCurrent?: boolean };
    }
  | {
      type: "exclude";
      operator: "!=" | "is-null" | "not-null";
      unit?: string | null;
      values: number[];
    };

const PLAIN_DRILLS = [
  "zoom",
  "zoom-in.binning",
  "zoom-in.timeseries",
  "zoom-in.geographic",
  "pk",
  "fk-details",
  "fk-filter",
  "distribution",
  "underlying-records",
  "summarize-column-by-time",
] as const;

type McpPlainDrill = (typeof PLAIN_DRILLS)[number];

type McpDrillBase = {
  type: "drill-thru";
  context: McpClickContext;
  /** The result-column name of the dimension, for a drill offered per dimension. */
  dimension?: string;
};

export type McpDrillOperation =
  | (McpDrillBase & { drill: McpPlainDrill })
  | (McpDrillBase & { drill: "sort"; direction: "asc" | "desc" })
  | (McpDrillBase & { drill: "quick-filter"; operator: string })
  | (McpDrillBase & {
      drill: "summarize-column";
      aggregation: "sum" | "avg" | "distinct";
    });

export type McpDeriveOperation =
  | { type: "date-filter/set"; value: McpDateFilterValue }
  | { type: "date-filter/clear" }
  // A null unit removes the bucket.
  | { type: "temporal-bucket/set"; unit: TemporalUnit | null }
  | McpDrillOperation;

/** Derive a new query by `operations` and show it in place of the current one. */
export type ApplyMcpOperations = (operations: McpDeriveOperation[]) => void;

/**
 * Drills that refine the current visualization without changing what it is:
 * the iframe applies them in place rather than handing them to the agent.
 */
const STAY_DRILLS: ReadonlySet<McpDrillOperation["drill"]> = new Set([
  "zoom",
  "zoom-in.binning",
  "zoom-in.timeseries",
  "zoom-in.geographic",
  "sort",
]);

export function isStayDrill(operation: McpDrillOperation): boolean {
  return STAY_DRILLS.has(operation.drill);
}

function formatDate(date: Date, hasTime: boolean): string {
  return dayjs(date).format(hasTime ? "YYYY-MM-DDTHH:mm:ss" : "YYYY-MM-DD");
}

export function getDateFilterOperation(
  value: DatePickerValue,
): McpDeriveOperation {
  switch (value.type) {
    case "specific":
      return {
        type: "date-filter/set",
        value: {
          type: "specific",
          operator: value.operator,
          values: value.values.map((date) => formatDate(date, value.hasTime)),
          hasTime: value.hasTime,
        },
      };
    case "relative":
      return {
        type: "date-filter/set",
        value: {
          type: "relative",
          unit: value.unit,
          value: value.value,
          offsetUnit: value.offsetUnit ?? null,
          offsetValue: value.offsetValue ?? null,
          options: { includeCurrent: value.options?.includeCurrent ?? false },
        },
      };
    case "exclude":
      return {
        type: "date-filter/set",
        value: {
          type: "exclude",
          operator: value.operator,
          unit: value.unit ?? null,
          values: value.values,
        },
      };
  }
}

function isScalar(value: unknown): value is McpScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * The named cells as scalars. A cell that is not a scalar is dropped when
 * `skipNonScalar` is set, and otherwise makes the result null.
 */
function toCells(
  cells: ReadonlyArray<{ name?: string; value: unknown }> | undefined,
  { skipNonScalar = false }: { skipNonScalar?: boolean } = {},
): McpCell[] | null {
  const result: McpCell[] = [];

  for (const { name, value } of cells ?? []) {
    if (name === undefined) {
      continue;
    }
    if (!isScalar(value)) {
      if (skipNonScalar) {
        continue;
      }
      return null;
    }
    result.push({ column: name, value });
  }

  return result;
}

/**
 * What was clicked, with each column named by its result-column name, or null
 * when the clicked value or a dimension cannot be sent as a scalar.
 */
export function getClickContext(clicked: ClickObject): McpClickContext | null {
  // Row cells are context only, so one that cannot be sent is left out.
  const row = toCells(
    clicked.data?.map(({ col, value }) => ({ name: col?.name, value })),
    { skipNonScalar: true },
  );
  const dimensions = toCells(
    clicked.dimensions?.map(({ column, value }) => ({
      name: column?.name,
      value,
    })),
  );

  if (row === null || dimensions === null) {
    return null;
  }

  const context: McpClickContext = {
    column: clicked.column?.name ?? null,
    row,
    dimensions,
  };

  // An absent value means a header click; null means a SQL NULL was clicked.
  if (clicked.value !== undefined) {
    if (!isScalar(clicked.value)) {
      return null;
    }
    context.value = clicked.value;
  }

  return context;
}

function isPlainDrill(name: string): name is McpPlainDrill {
  return PLAIN_DRILLS.some((drill) => drill === name);
}

/**
 * The derive operation for the click action named `actionName` on `clicked`,
 * or null when the server cannot derive it.
 */
export function getDrillOperation(
  actionName: string,
  clicked: ClickObject,
  dimension?: string,
): McpDrillOperation | null {
  const context = getClickContext(clicked);

  if (!context) {
    return null;
  }

  const base: McpDrillBase = {
    type: "drill-thru",
    context,
    ...(dimension !== undefined && { dimension }),
  };

  if (actionName === "sort.ascending") {
    return { ...base, drill: "sort", direction: "asc" };
  }
  if (actionName === "sort.descending") {
    return { ...base, drill: "sort", direction: "desc" };
  }
  if (actionName.startsWith("quick-filter.")) {
    return {
      ...base,
      drill: "quick-filter",
      operator: actionName.slice("quick-filter.".length),
    };
  }
  if (
    actionName === "summarize-column.sum" ||
    actionName === "summarize-column.avg" ||
    actionName === "summarize-column.distinct"
  ) {
    const aggregation =
      actionName === "summarize-column.sum"
        ? "sum"
        : actionName === "summarize-column.avg"
          ? "avg"
          : "distinct";

    return { ...base, drill: "summarize-column", aggregation };
  }
  if (isPlainDrill(actionName)) {
    return { ...base, drill: actionName };
  }

  return null;
}
