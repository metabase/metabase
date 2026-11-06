import type { LegacyDatasetQuery } from "metabase-types/api";

// LegacyDatasetQuery is opaque; mocks start from the same empty queries the FE builds by hand
export const EMPTY_STRUCTURED_QUERY = {
  database: null,
  type: "query",
  query: {
    "source-table": null,
  },
} as unknown as LegacyDatasetQuery;

// LegacyDatasetQuery is opaque; mocks start from the same empty queries the FE builds by hand
export const EMPTY_NATIVE_QUERY = {
  database: null,
  type: "native",
  native: {
    query: "",
    "template-tags": {},
  },
} as unknown as LegacyDatasetQuery;
