/**
 * SDK-runtime additions for the data-apps `sdk.cy.spec.ts` port.
 *
 * The shared `support/data-apps.ts` (owned by the sandbox/viewing/sync/admin
 * ports) carries the core machinery — `mockDataApp`, `openDataApp`,
 * `visitDataAppRoute`, `dataAppIframe`, `DATA_APP_TEST_ENV`. Its structural
 * `DataAppTestEnv` only models the fields THOSE specs use; the SDK-runtime spec
 * additionally exercises the `errorQuery` and `combinators` pages, and builds a
 * `LocalFieldReference` by hand (upstream's `dataAppNumericField`). Those live
 * here rather than in the shared module so this agent never edits a file a live
 * sibling depends on (PORTING rule 9 / parallel-agents note); fold into
 * `support/data-apps.ts` at consolidation.
 */
import type { Page } from "@playwright/test";

import {
  type MockDataAppOptions,
  mockDataApp as baseMockDataApp,
} from "./data-apps";
import { SAMPLE_DATABASE } from "./sample-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

type TableSource = { type: "table"; id: number };

/**
 * Structural port of `@metabase/embedding-sdk-react/data-app`'s
 * `LocalFieldReference` — a numeric field dimension hand-built the way an app
 * without a generated `metabase.data.ts` schema would build one.
 */
export type LocalFieldReference = {
  type: "column";
  fieldId: number;
  tableId: number;
  name: string;
  jsType: string;
};

/** Port of `dataAppNumericField` (e2e/.../data-apps/helpers/index.ts). */
export const dataAppNumericField = (
  fieldId: number,
  name: string,
): LocalFieldReference => ({
  type: "column",
  fieldId,
  tableId: ORDERS_ID,
  name,
  jsType: "number",
});

/**
 * The widened `testEnv` the SDK-runtime spec injects — the shared
 * `DataAppTestEnv` plus the `errorQuery` (`/query-states`) and `combinators`
 * (`/combinators`) pages this spec drives.
 */
export type SdkDataAppTestEnv = {
  scalarQuery: {
    source: TableSource;
    aggregations: { type: "operator"; operator: "count"; args: [] }[];
  };
  questionQuery: { source: TableSource };
  /** `/query-states` page: a deliberately invalid query → the hook errors. */
  errorQuery?: { source: TableSource };
  /** `/combinators` page: filter/breakout/orderBy/aggregations helpers. */
  combinators?: {
    source: TableSource;
    filterField: LocalFieldReference;
    filterValue: number;
    breakoutField: LocalFieldReference;
  };
};

/**
 * `mockDataApp` with the widened SDK `testEnv`. The base helper only
 * JSON-serializes `testEnv` into the bundle prelude, so passing a superset of
 * its declared shape is safe at runtime — the cast just tells TS so.
 */
export function mockDataApp(
  page: Page,
  appName: string,
  options: Omit<MockDataAppOptions, "testEnv"> & {
    testEnv?: SdkDataAppTestEnv;
  } = {},
) {
  return baseMockDataApp(page, appName, options as MockDataAppOptions);
}
