import { msgid, ngettext, t } from "ttag";

import {
  type OrderedValue,
  VALUE_BUCKETS,
  getValueBucketLabel,
} from "metabase/metadata/lifecycle";
import type { SegmentGroup } from "metabase/metadata/segment-groups";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field } from "metabase-types/api";

import type {
  BinsDefinition,
  ElapsedUnit,
  Grouping,
  PartitionDefinition,
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

function getTimeUnitSummary(unit: TimeUnit): string {
  switch (unit) {
    case "minute":
      return t`By minute`;
    case "hour":
      return t`By hour`;
    case "day":
      return t`By day`;
    case "week":
      return t`By week`;
    case "month":
      return t`By month`;
    case "quarter":
      return t`By quarter`;
    case "year":
      return t`By year`;
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

function getElapsedSinceSummary(unit: ElapsedUnit): string {
  switch (unit) {
    case "day":
      return t`Days since the value`;
    case "week":
      return t`Weeks since the value`;
    case "month":
      return t`Months since the value`;
    case "year":
      return t`Years since the value`;
  }
}

function getElapsedUntilSummary(unit: ElapsedUnit, fieldName: string): string {
  switch (unit) {
    case "day":
      return t`Days until ${fieldName}`;
    case "week":
      return t`Weeks until ${fieldName}`;
    case "month":
      return t`Months until ${fieldName}`;
    case "year":
      return t`Years until ${fieldName}`;
  }
}

export type GroupingSummaryContext = {
  fields: Field[];
  segmentGroups: SegmentGroup[];
  /** The status column's values in order, for process partitions */
  valueOrder: OrderedValue[];
};

/**
 * A one-line summary of what a grouping makes, like "By month" or
 * "Open · Won · Lost". `null` when its segment group is gone.
 */
export function getGroupingSummary(
  grouping: Grouping,
  context: GroupingSummaryContext,
): string | null {
  switch (grouping.kind) {
    case "time":
      return getTimeSummary(grouping.definition, context.fields);
    case "bins":
      return getBinsSummary(grouping.definition);
    case "partition":
      return getPartitionSummary(grouping.definition, context);
  }
}

function getTimeSummary(definition: TimeDefinition, fields: Field[]): string {
  switch (definition.type) {
    case "unit":
      return getTimeUnitSummary(definition.unit);
    case "extract":
      return getTimeExtractLabel(definition.extract);
    case "elapsed": {
      const to = definition.to;
      if (to === "now") {
        return getElapsedSinceSummary(definition.unit);
      }
      const target = fields.find((field) => getRawTableFieldId(field) === to);
      return getElapsedUntilSummary(
        definition.unit,
        target?.display_name ?? t`another date`,
      );
    }
  }
}

function getBinsSummary(definition: BinsDefinition): string {
  switch (definition.type) {
    case "auto":
      return t`Automatic ranges`;
    case "count":
      return ngettext(
        msgid`${definition.count} equal range`,
        `${definition.count} equal ranges`,
        definition.count,
      );
    case "quantile":
      return definition.count === 4
        ? t`Quartiles`
        : ngettext(
            msgid`${definition.count} quantile`,
            `${definition.count} quantiles`,
            definition.count,
          );
    case "edges":
      return definition.labels.join(" · ");
  }
}

function getPartitionSummary(
  definition: PartitionDefinition,
  { segmentGroups, valueOrder }: GroupingSummaryContext,
): string | null {
  switch (definition.type) {
    case "process": {
      if (definition.level === "order") {
        // Open states lead, then the ends
        const open = valueOrder.filter(({ bucket }) => bucket === "open");
        const rest = valueOrder.filter(({ bucket }) => bucket !== "open");
        return [...open, ...rest].map(({ value }) => value).join(" → ");
      }
      const present = new Set(valueOrder.map(({ bucket }) => bucket));
      return VALUE_BUCKETS.filter((bucket) => present.has(bucket))
        .map(getValueBucketLabel)
        .join(" · ");
    }
    case "segment-group": {
      const group = segmentGroups.find(
        ({ id }) => id === definition.segmentGroupId,
      );
      if (!group) {
        return null;
      }
      const labels = group.members.map(({ label }) => label);
      return (group.other ? [...labels, t`Other`] : labels).join(" · ");
    }
    case "value-map": {
      const labels = definition.groups.map(({ label }) => label);
      return (definition.other ? [...labels, t`Other`] : labels).join(" · ");
    }
  }
}
