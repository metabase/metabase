import { t } from "ttag";

import type { OrderedValue } from "metabase/metadata/lifecycle";
import type { SegmentGroup } from "metabase/metadata/segment-groups";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, Table } from "metabase-types/api";

import type {
  BinsDefinition,
  ElapsedUnit,
  Grouping,
  PartitionDefinition,
  RelatedDefinition,
  TimeDefinition,
  TimeExtract,
  TimeUnit,
} from "./types";

/** A time unit's name, like "Month" */
export function getTimeUnitLabel(unit: TimeUnit): string {
  switch (unit) {
    case "minute":
      return t`Minute`;
    case "hour":
      return t`Hour`;
    case "day":
      return t`Day`;
    case "week":
      return t`Week`;
    case "month":
      return t`Month`;
    case "quarter":
      return t`Quarter`;
    case "year":
      return t`Year`;
  }
}

/** A part of a date's name, like "Day of week" */
export function getTimeExtractLabel(extract: TimeExtract): string {
  switch (extract) {
    case "hour-of-day":
      return t`Hour of day`;
    case "day-of-week":
      return t`Day of week`;
    case "day-of-month":
      return t`Day of month`;
    case "week-of-year":
      return t`Week of year`;
    case "month-of-year":
      return t`Month of year`;
    case "quarter-of-year":
      return t`Quarter of year`;
  }
}

/** An elapsed time's unit, plural: "days" */
export function getElapsedUnitLabel(unit: ElapsedUnit): string {
  switch (unit) {
    case "day":
      return t`days`;
    case "week":
      return t`weeks`;
    case "month":
      return t`months`;
    case "year":
      return t`years`;
  }
}

// How many values each part of a date can take
const EXTRACT_BUCKET_COUNTS: Record<TimeExtract, number> = {
  "hour-of-day": 24,
  "day-of-week": 7,
  "day-of-month": 31,
  "week-of-year": 53,
  "month-of-year": 12,
  "quarter-of-year": 4,
};

export type GroupingDescriptionContext = {
  fields: Field[];
  segmentGroups: SegmentGroup[];
  /** The status column's values in order, for process partitions */
  valueOrder: OrderedValue[];
  /** The table a foreign key points to, with its columns, for related groupings */
  relatedTable?: Pick<Table, "display_name" | "fields">;
};

/**
 * How a grouping groups, like "Period: month" or "Segment group: Deal
 * outcome". `null` when what it uses is gone.
 */
export function getGroupingStrategy(
  grouping: Grouping,
  context: GroupingDescriptionContext,
): string | null {
  switch (grouping.kind) {
    case "time":
      return getTimeStrategy(grouping.definition, context.fields);
    case "bins":
      return getBinsStrategy(grouping.definition);
    case "partition":
      return getPartitionStrategy(grouping.definition, context);
    case "related":
      return getRelatedStrategy(grouping.definition, context.relatedTable);
  }
}

/**
 * How many buckets a grouping makes, when that doesn't depend on the data:
 * a period's buckets depend on the dates there are, so it's `null`.
 */
export function getGroupingBucketCount(
  grouping: Grouping,
  { segmentGroups, valueOrder }: GroupingDescriptionContext,
): number | null {
  switch (grouping.kind) {
    case "time":
      return grouping.definition.type === "extract"
        ? EXTRACT_BUCKET_COUNTS[grouping.definition.extract]
        : null;
    case "bins": {
      const definition = grouping.definition;
      switch (definition.type) {
        case "auto":
          return null;
        case "count":
        case "quantile":
          return definition.count;
        case "edges":
          return definition.edges.length;
      }
      break;
    }
    case "partition": {
      const definition = grouping.definition;
      switch (definition.type) {
        case "process":
          if (valueOrder.length === 0) {
            return null;
          }
          return definition.level === "order"
            ? valueOrder.length
            : new Set(valueOrder.map(({ bucket }) => bucket)).size;
        case "segment-group": {
          const group = segmentGroups.find(
            ({ id }) => id === definition.segmentGroupId,
          );
          return group ? group.members.length + (group.other ? 1 : 0) : null;
        }
        case "value-map":
          return definition.groups.length + (definition.other ? 1 : 0);
      }
      break;
    }
    case "related":
      return null;
  }
  return null;
}

function getTimeStrategy(definition: TimeDefinition, fields: Field[]): string {
  switch (definition.type) {
    case "unit":
      return t`Period: ${getTimeUnitLabel(definition.unit).toLowerCase()}`;
    case "extract":
      return t`Part of the date: ${getTimeExtractLabel(definition.extract).toLowerCase()}`;
    case "elapsed": {
      const unit = getElapsedUnitLabel(definition.unit);
      const to = definition.to;
      if (to === "now") {
        return t`Time since the date, in ${unit}`;
      }
      const target = fields.find((field) => getRawTableFieldId(field) === to);
      const targetName = target?.display_name ?? t`another date`;
      return t`Time until ${targetName}, in ${unit}`;
    }
  }
}

function getBinsStrategy(definition: BinsDefinition): string {
  switch (definition.type) {
    case "auto":
      return t`Automatic ranges`;
    case "count":
      return t`Equal ranges`;
    case "quantile":
      return t`Quantiles`;
    case "edges":
      return t`Custom ranges`;
  }
}

function getPartitionStrategy(
  definition: PartitionDefinition,
  { segmentGroups }: GroupingDescriptionContext,
): string | null {
  switch (definition.type) {
    case "process":
      return definition.level === "order"
        ? t`Status order: all states`
        : t`Status order: outcome buckets`;
    case "segment-group": {
      const group = segmentGroups.find(
        ({ id }) => id === definition.segmentGroupId,
      );
      return group ? t`Segment group: ${group.name}` : null;
    }
    case "value-map":
      return t`Custom named groups`;
  }
}

/** "Related column: Accounts › Plan", plus one of Plan's groupings if picked */
function getRelatedStrategy(
  { targetFieldId, groupingName }: RelatedDefinition,
  relatedTable: GroupingDescriptionContext["relatedTable"],
): string | null {
  const target = relatedTable?.fields?.find(
    (field) => getRawTableFieldId(field) === targetFieldId,
  );
  if (!relatedTable || !target) {
    return null;
  }
  const path = [relatedTable.display_name, target.display_name, groupingName]
    .filter(Boolean)
    .join(" › ");
  return t`Related column: ${path}`;
}
