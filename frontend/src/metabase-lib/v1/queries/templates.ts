import type { LegacyDatasetQuery } from "metabase-types/api";

// LegacyDatasetQuery is opaque; these empty queries are the only ones the FE builds by hand until Lib supports empty queries
export const STRUCTURED_QUERY_TEMPLATE = {
  database: null,
  type: "query",
  query: {
    "source-table": null,
  },
} as unknown as LegacyDatasetQuery;

// LegacyDatasetQuery is opaque; these empty queries are the only ones the FE builds by hand until Lib supports empty queries
export const NATIVE_QUERY_TEMPLATE = {
  database: null,
  type: "native",
  native: {
    query: "",
    "template-tags": {},
  },
} as unknown as LegacyDatasetQuery;
