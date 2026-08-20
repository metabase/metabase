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
  /**
   * A deployed app runs the card its query was published as, so every query the
   * fixture renders names one. The swap drops the static clauses the card
   * already contains, so each id must match its whole authored query.
   */
  scalarQuery: {
    source: TableSource;
    aggregations: CountAggregation[];
    savedQuestionSourceId: number;
  };
  questionQuery: { source: TableSource; savedQuestionSourceId: number };
  /**
   * `/download-question` page: the id of a saved CHART question (so a `.png`
   * export is offered). Passed in because the id tracks the Cypress snapshot.
   */
  downloadQuestionId?: number;
  /**
   * `custom:`-prefixed plugin identifiers the app allows the SDK to load (e.g.
   * `["custom:demo-viz"]`). The fixture forwards this to the SDK provider's
   * `allowedCustomVisualizations`, which hard-gates custom-viz loading.
   */
  allowedCustomVisualizations?: `custom:${string}`[];
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
   * `/query-states` page: a deliberately invalid query (a card that does not
   * exist), so the hook resolves to an `error` state rather than to the refusal
   * an unsynchronized query would raise; the page also exercises `refetch`.
   */
  errorQuery?: { source: TableSource; savedQuestionSourceId: number };
  /**
   * `/actions` page: the id of the action the spec creates and `useAction`
   * executes, so it can't be hard-coded in the app. Left out to exercise the "no
   * action id" path, where the hook must not request anything.
   */
  actionId?: number;
  /** `/actions` page: the parameters the page passes to `execute()`. */
  actionParams?: Record<string, string | number>;
  /**
   * `/native-query` page: a hand-built native query the app renders through
   * `<StaticQuestion card={{ query }}>`. Data apps aren't allowed to run native
   * SQL (the backend rejects it for the `data-app` client), so the page exists to
   * assert that rejection.
   */
  nativeQuery?: { database: number; query: string };
};

// The queries use the SDK's `source` API (`{ type: "table", id }`); the database
// is resolved from the SDK's metadata store, so no databaseId is passed.
type TableSource = { type: "table"; id: number };
type CountAggregation = { type: "operator"; operator: "count"; args: [] };
