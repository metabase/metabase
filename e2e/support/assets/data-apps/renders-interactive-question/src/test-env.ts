// The queries use the SDK's `source` API (`{ type: "table", id }`); the database
// is resolved from the SDK's metadata store, so no databaseId is passed.
type TableSource = { type: "table"; id: number };
type CountAggregation = { type: "operator"; operator: "count"; args: [] };

// A raw field dimension, shaped like an entry from a generated `metabase.data.ts`
// schema. Built in the spec from `SAMPLE_DATABASE` field ids and passed in so the
// fixture can exercise the `filter`/`breakout`/`orderBy` query-builder helpers.
export type FieldDimension = {
  type: "column";
  fieldId: number;
  tableId: number;
  name: string;
  "source-name"?: string;
  displayName?: string;
  jsType: "number" | "string" | "Date" | "boolean";
  baseType?: string;
};

export type DataAppTestEnv = {
  scalarQuery: { source: TableSource; aggregations: CountAggregation[] };
  questionQuery: { source: TableSource };
  // Config for the `/sandboxing` page: URLs it fetches to probe the sandbox's
  // `allowed_hosts` gate. `allowedUrl` is expected to be in `allowed_hosts`,
  // `blockedUrl` is not. `xhr*Url` drive the same gate through `XMLHttpRequest`.
  sandbox?: {
    allowedUrl: string;
    blockedUrl: string;
    xhrAllowedUrl?: string;
    xhrBlockedUrl?: string;
  };
  // `/query-states` page: a deliberately invalid query (bad table id) so the
  // hook resolves to an `error` state; the page also exercises `refetch`.
  errorQuery?: { source: TableSource };
  // `/combinators` page: exercises `filter`/`breakout`/`orderBy`/`aggregations`.
  // The page hardcodes a `>` filter + count aggregation ordered desc, so
  // `filterField` must be numeric; `breakoutField` groups the rows.
  combinators?: {
    source: TableSource;
    filterField: FieldDimension;
    filterValue: number;
    breakoutField: FieldDimension;
  };
  // `/actions` page: the id passed to `useAction`. The execute endpoint is
  // stubbed by the spec, so any number works.
  actionId?: number;
};

declare global {
  // eslint-disable-next-line no-var -- `var` (not `const`) so `globalThis.x` typechecks
  var __METABASE_DATA_APP_TEST_ENV__: DataAppTestEnv | undefined;
}

export function getTestEnv(): DataAppTestEnv {
  const env = globalThis.__METABASE_DATA_APP_TEST_ENV__;

  if (!env) {
    throw new Error(
      "data-app test env was not injected — pass `testEnv` to H.mockDataApp",
    );
  }

  return env;
}
