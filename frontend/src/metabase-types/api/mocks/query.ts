import {
  NativeDatasetQuery,
  NativeQuery,
  StructuredDatasetQuery,
  StructuredQuery,
} from "metabase-types/api";

export const createMockStructuredQuery = (
  opts?: Partial<StructuredQuery>,
): StructuredQuery => ({
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
  database: 1,
  query: createMockStructuredQuery(),
  ...opts,
});

export const createMockNativeDatasetQuery = (
  opts?: Partial<NativeDatasetQuery>,
): NativeDatasetQuery => ({
  type: "native",
  database: 1,
  query: createMockNativeQuery(),
  ...opts,
});
