import type {
  NativeDatasetQuery,
  NativeQuery,
  StructuredDatasetQuery,
  StructuredQuery,
} from "metabase-types/api";

// Corresponds to the Sample Database and sample Products table from the built-in preset:
// https://github.com/metabase/metabase/blob/master/frontend/src/metabase-types/api/mocks/presets/sample_database.ts
const DEFAULT_DB_ID = 1;
const DEFAULT_TABLE_ID = 1;

export const createMockStructuredQuery = (
  opts?: Partial<StructuredQuery>,
): StructuredQuery => ({
  "source-table": DEFAULT_TABLE_ID,
  ...opts,
});

export const createMockNativeQuery = (
  opts?: Partial<NativeQuery>,
): NativeQuery => ({
  query: "SELECT 1",
  ...opts,
});

export const createMockStructuredDatasetQuery = (
  opts?: Partial<StructuredDatasetQuery>,
): StructuredDatasetQuery => ({
  type: "query",
  database: DEFAULT_DB_ID,
  query: createMockStructuredQuery(),
  ...opts,
});

export const createMockNativeDatasetQuery = (
  opts?: Partial<NativeDatasetQuery>,
): NativeDatasetQuery => ({
  type: "native",
  database: DEFAULT_DB_ID,
  native: createMockNativeQuery(),
  ...opts,
});
