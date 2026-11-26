import { t } from "ttag";

import type { DataCheckDefinition, DataCheckValue } from "./types";
import {
  formatDataCheckNumber,
  formatDataCheckPercent,
  isDataCheckRecord,
} from "./utils";

function formatBound(value: DataCheckValue | undefined): string | undefined {
  if (typeof value === "number") {
    return formatDataCheckNumber(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (isDataCheckRecord(value) && typeof value.sql === "string") {
    return value.sql;
  }
  return undefined;
}

function formatShare(value: DataCheckValue | undefined): string | undefined {
  return typeof value === "number" ? formatDataCheckPercent(value) : undefined;
}

function formatList(value: DataCheckValue | undefined): string {
  if (!Array.isArray(value)) {
    return formatBound(value) ?? "";
  }
  return value.map((item) => formatBound(item) ?? String(item)).join(", ");
}

function describeRange(
  subject: string,
  min: string | undefined,
  max: string | undefined,
) {
  if (min != null && max != null) {
    return min === max
      ? t`${subject} is exactly ${min}`
      : t`${subject} is between ${min} and ${max}`;
  }
  if (min != null) {
    return t`${subject} is at least ${min}`;
  }
  if (max != null) {
    return t`${subject} is at most ${max}`;
  }
  return subject;
}

function describeOperator(operator: string) {
  switch (operator) {
    case "<":
      return t`is less than`;
    case "=":
      return t`equals`;
    case ">=":
      return t`is at least`;
    case ">":
      return t`is greater than`;
    default:
      return t`is at most`;
  }
}

function describeStructureCheck(
  definition: DataCheckDefinition,
): string | null {
  const { check, table, params } = definition;
  const text = (name: string) => formatBound(params[name]) ?? "";
  const list = (name: string) => formatList(params[name]);
  const column = text("column");

  const min = formatBound(params.min);
  const max = formatBound(params.max);

  switch (check) {
    case "column_exists":
      return t`${table} has a column named ${column}`;
    case "column_type": {
      const types = params.type != null ? text("type") : list("type_in");
      return t`${column} has the type ${types}`;
    }
    case "schema_matches":
      return params.allow_added === true
        ? t`${table} has at least the expected columns`
        : t`${table} has exactly the expected columns`;
    case "column_count":
      return describeRange(
        t`The number of columns in ${table}`,
        formatBound(params.equals) ?? min,
        formatBound(params.equals) ?? max,
      );
    case "not_null":
      return t`${column} always has a value`;
    case "null_proportion_at_most":
      return t`At most ${formatShare(params.max)} of ${column} is missing`;
    case "not_empty_string":
      return t`${column} is never blank`;
    case "not_constant":
      return t`${column} has more than one distinct value`;
    case "placeholder_not_present":
      return t`${column} is never a placeholder (${list("values")})`;
    case "unique":
      return t`${column} has no duplicates`;
    case "unique_combination":
      return t`Each combination of ${list("columns")} appears once`;
    case "distinct_count_equals_row_count":
      return t`Every row has a different ${list("columns")}`;
    case "unique_proportion_at_least":
      return t`At least ${formatShare(params.min)} of ${column} values are distinct`;
    case "references":
    case "references_where":
      return t`Every ${column} exists in ${text("to")}`;
    case "orphan_proportion_at_most":
      return t`At most ${formatShare(params.max)} of ${column} values are missing from ${text("to")}`;
    case "parent_has_children":
      return t`Every ${text("key")} has at least one row in ${text("child")}`;
    default:
      return null;
  }
}

function describeValueCheck(definition: DataCheckDefinition): string | null {
  const { check, params } = definition;
  const text = (name: string) => formatBound(params[name]) ?? "";
  const list = (name: string) => formatList(params[name]);
  const column = text("column");

  const min = formatBound(params.min);
  const max = formatBound(params.max);

  switch (check) {
    case "accepted_values":
      return t`${column} is one of: ${list("values")}`;
    case "not_in_set":
      return t`${column} is never: ${list("values")}`;
    case "matches_regex":
      return t`${column} matches the pattern ${text("pattern")}`;
    case "length_between":
      return describeRange(t`The length of ${column}`, min, max);
    case "valid_format":
      return t`${column} is a valid ${text("format")}`;
    case "like_pattern":
      return t`${column} looks like ${text("pattern")}`;
    case "between":
    case "date_within_window":
      return describeRange(column, min, max);
    case "non_negative":
      return t`${column} is never negative`;
    case "positive":
      return t`${column} is greater than zero`;
    case "not_in_future":
      return t`${column} is not in the future`;
    case "expression_is_true":
      return t`Every row satisfies: ${text("expression")}`;
    case "column_a_lte_column_b": {
      const operator = describeOperator(text("operator"));
      return `${text("a")} ${operator} ${text("b")}`;
    }
    case "at_least_one_not_null":
      return t`At least one of ${list("columns")} has a value`;
    case "conditional_value": {
      const condition = text("when");
      if (params.equals === null) {
        return t`When ${condition}, ${column} is empty`;
      }
      const expected =
        params.equals != null ? text("equals") : list("in") || list("between");
      return t`When ${condition}, ${column} is ${expected}`;
    }
    case "mutually_exclusive_ranges":
      return t`Ranges from ${text("lower")} to ${text("upper")} do not overlap`;
    default:
      return null;
  }
}

function describeMetricCheck(definition: DataCheckDefinition): string | null {
  const { check, table, params } = definition;
  const text = (name: string) => formatBound(params[name]) ?? "";
  const list = (name: string) => formatList(params[name]);
  const column = text("column");

  const min = formatBound(params.min);
  const max = formatBound(params.max);

  switch (check) {
    case "row_count_at_least":
    case "row_count_between":
      return describeRange(t`The number of rows in ${table}`, min, max);
    case "row_count_in_partition_at_least":
      return t`Every ${list("partition_by")} has at least ${min} rows`;
    case "freshness_within":
      return t`The newest ${column} is at most ${text("max_lag")} old`;
    case "recent_rows_exist":
      return t`At least ${text("min_rows")} rows have a ${column} in the last ${text("window")}`;
    case "partition_complete_through":
      return t`No ${text("grain")} is missing in ${text("partition")}`;
    case "aggregate_between":
      return describeRange(t`${text("agg")} of ${column}`, min, max);
    case "quantile_between":
      return describeRange(
        t`Quantile ${text("quantile")} of ${column}`,
        min,
        max,
      );
    case "distinct_count_between":
      return describeRange(
        t`The number of distinct ${column} values`,
        min,
        max,
      );
    case "most_common_value_in":
      return t`The most common ${column} is one of: ${list("values")}`;
    case "value_share_between":
      return describeRange(
        t`The share of ${column} that is ${text("value")}`,
        formatShare(params.min),
        formatShare(params.max),
      );
    default:
      return null;
  }
}

function describeTableCheck(definition: DataCheckDefinition): string | null {
  const { check, table, params } = definition;
  const text = (name: string) => formatBound(params[name]) ?? "";
  const list = (name: string) => formatList(params[name]);
  const column = text("column");
  const other = text("other");

  switch (check) {
    case "row_count_equals_other":
      return t`${table} has as many rows as ${other}`;
    case "row_count_fewer_than_other":
      return t`${table} has fewer rows than ${other}`;
    case "aggregate_equals_other":
      return t`${text("agg")} equals ${text("other_agg")} on ${other}`;
    case "columns_equal_across_tables":
      return t`${table}.${column} matches ${other}.${text("other_column")} for the same ${text("key")}`;
    case "cardinality_equals":
      return t`${table}.${column} has the same distinct values as ${other}.${text("other_column")}`;
    case "sequential_values":
      return t`${column} goes up step by step with no gaps`;
    case "monotonic":
      return t`${column} keeps ${text("direction")} when ordered by ${text("order_by")}`;
    case "no_gaps_in_spine":
      return t`No ${text("grain")} is missing in ${column}`;
    case "row_count_change_within":
      return t`The number of rows in ${table} stays close to the last run`;
    case "last_updated_within":
      return t`${table} was updated in the last ${text("max_lag")}`;
    case "distribution_matches":
      return t`The distribution of ${column} stays close to its reference`;
    case "volume_anomaly":
      return t`The number of new rows in ${table} is in its usual range`;
    case "freshness_anomaly":
      return t`${table} is updated as often as usual`;
    case "column_metric_anomaly":
      return t`${column} stays in its usual range`;
    case "dimension_anomaly":
      return t`Rows per ${list("dimensions")} stay in their usual range`;
    case "schema_change":
      return t`The columns of ${table} have not changed since the last run`;
    case "metric_change_within":
      return t`${text("metric")} stays close to the last measurement`;
    default:
      return null;
  }
}

export function describeDataCheck(definition: DataCheckDefinition): string {
  const { check, table } = definition;
  return (
    describeStructureCheck(definition) ??
    describeValueCheck(definition) ??
    describeMetricCheck(definition) ??
    describeTableCheck(definition) ??
    t`${check} on ${table}`
  );
}
