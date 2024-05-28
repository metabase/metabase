import type {
  Database,
  DatabaseData,
  DatabaseFeature,
  SavedQuestionDatabase,
} from "metabase-types/api";

export const COMMON_DATABASE_FEATURES: DatabaseFeature[] = [
  "actions",
  "basic-aggregations",
  "binning",
  "case-sensitivity-string-filter-options",
  "expression-aggregations",
  "expressions",
  "foreign-keys",
  "native-parameters",
  "nested-queries",
  "standard-deviation-aggregations",
  "persist-models",
  "percentile-aggregations",
  "left-join",
  "right-join",
  "inner-join",
  "full-join",
];

export const createMockDatabase = (opts?: Partial<Database>): Database => ({
  ...createMockDatabaseData(opts),
  id: 1,
  engine: "H2",
  can_upload: false,
  is_sample: false,
  is_saved_questions: false,
  created_at: "2015-01-01T20:10:30.200",
  updated_at: "2015-01-01T20:10:30.200",
  timezone: "UTC",
  native_permissions: "write",
  initial_sync_status: "complete",
  features: COMMON_DATABASE_FEATURES,
  uploads_enabled: false,
  uploads_schema_name: null,
  uploads_table_prefix: null,
  ...opts,
});

export const createMockDatabaseData = (
  opts?: Partial<DatabaseData>,
): DatabaseData => ({
  name: "Database",
  engine: "H2",
  details: {},
  schedules: {},
  auto_run_queries: false,
  refingerprint: false,
  cache_ttl: null,
  is_sample: false,
  is_full_sync: false,
  is_on_demand: false,
  ...opts,
});

export const createMockSavedQuestionsDatabase = (): SavedQuestionDatabase => ({
  id: -1337,
  name: "Saved Questions",
  is_saved_questions: true,
});
