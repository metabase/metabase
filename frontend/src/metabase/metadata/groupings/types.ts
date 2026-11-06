import type { FieldId } from "metabase-types/api";

export type TimeUnit =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export const TIME_UNITS: TimeUnit[] = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

export type TimeExtract =
  | "hour-of-day"
  | "day-of-week"
  | "day-of-month"
  | "week-of-year"
  | "month-of-year"
  | "quarter-of-year";

export const TIME_EXTRACTS: TimeExtract[] = [
  "hour-of-day",
  "day-of-week",
  "day-of-month",
  "week-of-year",
  "month-of-year",
  "quarter-of-year",
];

export type ElapsedUnit = "day" | "week" | "month" | "year";

export const ELAPSED_UNITS: ElapsedUnit[] = ["day", "week", "month", "year"];

/** How a date column's values group */
export type TimeDefinition =
  | { type: "unit"; unit: TimeUnit }
  | { type: "extract"; extract: TimeExtract }
  /** From this column's value to now (Age) or to another date column of the table */
  | { type: "elapsed"; to: "now" | FieldId; unit: ElapsedUnit };

/** How a number column's values group into ranges */
export type BinsDefinition =
  | { type: "auto" }
  | { type: "count"; count: number }
  | { type: "quantile"; count: number }
  /** Ranges start at each edge; the last is open-ended. `labels[i]` names the range starting at `edges[i]` */
  | { type: "edges"; edges: number[]; labels: string[] };

/** A value group of a value-map partition */
export type PartitionValueGroup = { label: string; values: string[] };

/** How a column's values group into named, non-overlapping groups */
export type PartitionDefinition =
  /** The status column's full order, or its buckets */
  | { type: "process"; level: "order" | "buckets" }
  /** A partition segment group whose segments filter on this column */
  | { type: "segment-group"; segmentGroupId: string }
  | { type: "value-map"; groups: PartitionValueGroup[]; other: boolean };

/**
 * On a foreign key: group by a column of the table it points to, like deals
 * by their account's plan. By that column's values, or by one of its groupings.
 */
export type RelatedDefinition = {
  targetFieldId: FieldId;
  /** One of the target column's groupings; `null` groups by its values */
  groupingName: string | null;
};

export type GroupingKind = "time" | "bins" | "partition" | "related";

/** Built-ins are implicit, sync's are inferred, and an admin's are saved */
export type GroupingSource = "built-in" | "sync" | "admin";

/**
 * A named way to group one column's values into fewer, ordered groups.
 * People see it by its name in Group by.
 */
export type Grouping = {
  name: string;
  source: GroupingSource;
  /** Why sync made it */
  signal?: string;
} & GroupingDefinition;

export type GroupingDefinition =
  | { kind: "time"; definition: TimeDefinition }
  | { kind: "bins"; definition: BinsDefinition }
  | { kind: "partition"; definition: PartitionDefinition }
  | { kind: "related"; definition: RelatedDefinition };

/** The default grouping sync picked, and why */
export type DefaultGroupingInference = { name: string; signal: string };
