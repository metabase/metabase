import type { LocalFieldReference } from "@metabase/embedding-sdk-react/data-app";

/**
 * The config a spec injects into a data-app fixture (via `H.mockDataApp`'s
 * `testEnv`), so a fixture doesn't hard-code values that track the Cypress
 * snapshot — sample-DB ids, URLs, the id of an action the spec created.
 *
 * It lives with the tests rather than inside a fixture because it's the contract
 * between the two, and the fixtures are standalone SDK apps outside this TS
 * program (see `exclude` in `e2e/tsconfig.json`). A fixture reads it back at
 * runtime through its own `getTestEnv()`.
 */
export type DataAppTestEnv = {
  scalarQuery: { source: TableSource; aggregations: CountAggregation[] };
  questionQuery: { source: TableSource };
  /**
   * `/sandboxing` page: URLs it fetches to probe the sandbox's `allowed_hosts`
   * gate. `allowedUrl` is expected to be in `allowed_hosts`, `blockedUrl` is not.
   * `xhr*Url` drive the same gate through `XMLHttpRequest`.
   */
  sandbox?: {
    allowedUrl: string;
    blockedUrl: string;
    xhrAllowedUrl?: string;
    xhrBlockedUrl?: string;
  };
  /**
   * `/query-states` page: a deliberately invalid query (bad table id), so the hook
   * resolves to an `error` state; the page also exercises `refetch`.
   */
  errorQuery?: { source: TableSource };
  /**
   * `/combinators` page: exercises `filter`/`breakout`/`orderBy`/`aggregations`.
   * The page hardcodes a `>` filter and a count aggregation ordered desc, so
   * `filterField` must be numeric; `breakoutField` groups the rows.
   */
  combinators?: {
    source: TableSource;
    filterField: LocalFieldReference;
    filterValue: number;
    breakoutField: LocalFieldReference;
  };
  /**
   * `/actions` page: the id of the action the spec creates and `useAction`
   * executes, so it can't be hard-coded in the app. Left out to exercise the "no
   * action id" path, where the hook must not request anything.
   */
  actionId?: number;
  /** `/actions` page: the parameters the page passes to `execute()`. */
  actionParams?: Record<string, string | number>;
};

// The queries use the SDK's `source` API (`{ type: "table", id }`); the database
// is resolved from the SDK's metadata store, so no databaseId is passed.
type TableSource = { type: "table"; id: number };
type CountAggregation = { type: "operator"; operator: "count"; args: [] };
