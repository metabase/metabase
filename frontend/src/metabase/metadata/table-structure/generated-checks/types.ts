export const CHECK_ASSERTIONS = [
  "column_exists",
  "column_type",
  "schema_matches",
  "column_count",
  "not_null",
  "null_proportion_at_most",
  "not_empty_string",
  "not_constant",
  "placeholder_not_present",
  "unique",
  "unique_combination",
  "distinct_count_equals_row_count",
  "unique_proportion_at_least",
  "references",
  "references_where",
  "orphan_proportion_at_most",
  "parent_has_children",
  "accepted_values",
  "not_in_set",
  "matches_regex",
  "length_between",
  "valid_format",
  "like_pattern",
  "between",
  "non_negative",
  "positive",
  "not_in_future",
  "date_within_window",
  "expression_is_true",
  "column_a_lte_column_b",
  "at_least_one_not_null",
  "conditional_value",
  "mutually_exclusive_ranges",
  "row_count_at_least",
  "row_count_between",
  "row_count_in_partition_at_least",
  "freshness_within",
  "recent_rows_exist",
  "partition_complete_through",
  "aggregate_between",
  "quantile_between",
  "distinct_count_between",
  "most_common_value_in",
  "value_share_between",
  "row_count_equals_other",
  "row_count_fewer_than_other",
  "aggregate_equals_other",
  "columns_equal_across_tables",
  "cardinality_equals",
  "sequential_values",
  "monotonic",
  "no_gaps_in_spine",
] as const;

export type CheckAssertion = (typeof CHECK_ASSERTIONS)[number];

export type CheckSeverity = "error" | "warn";

export type CheckSqlValue = { sql: string };

export type CheckParamValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | CheckSqlValue;

export type CheckTableRef = {
  schema: string | null;
  name: string;
};

export type GeneratedCheck = {
  id: string;
  check: CheckAssertion;
  table: CheckTableRef;
  name: string;
  where?: string;
  severity: CheckSeverity;
  params: Readonly<Record<string, CheckParamValue>>;
  basis: string;
};

export type CheckResult =
  | { status: "passing" }
  | { status: "failing"; summary: string }
  | { status: "not-run" };

export type CheckResults = ReadonlyMap<GeneratedCheck["id"], CheckResult>;

export type FormatCheckType =
  | "email"
  | "uuid"
  | "date"
  | "timestamp"
  | "integer"
  | "decimal"
  | "json"
  | "url"
  | "ip"
  | "phone";
