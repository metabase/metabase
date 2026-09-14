import type {
  DataSensitivityCounts,
  DataSensitivityDatabaseResult,
  DataSensitivityFieldResult,
  DataSensitivityTableError,
  DataSensitivityTableResult,
  DataSensitivityUsage,
} from "metabase-types/api";

export function createMockDataSensitivityUsage(
  opts?: Partial<DataSensitivityUsage>,
): DataSensitivityUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    total_tokens: 0,
    ...opts,
  };
}

export function createMockDataSensitivityCounts(
  opts?: Partial<DataSensitivityCounts>,
): DataSensitivityCounts {
  return {
    fields: 0,
    agree: 0,
    disagree: 0,
    new: 0,
    abstain: 0,
    dropped: 0,
    semantic_changed: 0,
    ...opts,
  };
}

export function createMockDataSensitivityFieldResult(
  opts?: Partial<DataSensitivityFieldResult>,
): DataSensitivityFieldResult {
  return {
    field_id: 1,
    name: "EMAIL",
    display_name: "Email",
    base_type: "type/Text",
    current: {
      data_sensitivity: null,
      human_set: false,
      state: "unscanned",
      semantic_type: null,
    },
    proposed: {
      data_sensitivity: "PII",
      confidence: "high",
      semantic_type: null,
      reasoning: "Values look like email addresses.",
    },
    status: "new",
    semantic_changed: false,
    ...opts,
  };
}

export function createMockDataSensitivityTableResult(
  opts?: Partial<DataSensitivityTableResult>,
): DataSensitivityTableResult {
  return {
    table_id: 1,
    table_name: "PEOPLE",
    schema: "PUBLIC",
    database_id: 1,
    model: "test/mini",
    requests: 1,
    usage: createMockDataSensitivityUsage(),
    sample_error: null,
    counts: createMockDataSensitivityCounts(),
    fields: [],
    ...opts,
  };
}

export function createMockDataSensitivityTableError(
  opts?: Partial<DataSensitivityTableError>,
): DataSensitivityTableError {
  return {
    table_id: 2,
    table_name: "ORDERS",
    schema: "PUBLIC",
    error: "boom",
    error_code: null,
    ...opts,
  };
}

export function createMockDataSensitivityDatabaseResult(
  opts?: Partial<DataSensitivityDatabaseResult>,
): DataSensitivityDatabaseResult {
  return {
    database_id: 1,
    schema: null,
    tables: [],
    counts: createMockDataSensitivityCounts(),
    usage: createMockDataSensitivityUsage(),
    requests: 0,
    failed: 0,
    ...opts,
  };
}
