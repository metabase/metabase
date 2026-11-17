import fetchMock from "fetch-mock";

import {
  setupDatabaseIdFieldsEndpoints,
  setupDatabasesEndpoints,
  setupFieldsValuesEndpoints,
  setupLibraryEndpoints,
  setupPropertiesEndpoints,
  setupTablesBulkEndpoints,
  setupUserAcknowledgementEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import type {
  Database,
  Dataset,
  GetFieldValuesResponse,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

type SetupMockApiOpts = {
  database: Database;
  fieldValues: GetFieldValuesResponse[];
  getDataset: (query: unknown) => Dataset | null;
  hasLibrary?: boolean;
};

const networkFetch = window.fetch.bind(window);

export function setupMockApi({
  database,
  fieldValues,
  getDataset,
  hasLibrary = false,
}: SetupMockApiOpts) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();
  fetchMock.mockGlobal();
  setupDatabasesEndpoints([database], { hasSavedQuestions: false });
  setupDatabaseIdFieldsEndpoints({ database });
  setupTablesBulkEndpoints();
  setupUsersEndpoints([createMockUserListResult()]);
  setupUserAcknowledgementEndpoints({
    key: "seen-publish-tables-info",
    value: true,
  });
  setupLibraryEndpoints(hasLibrary);
  setupFieldsValuesEndpoints(fieldValues);
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ library: hasLibrary }),
  });
  window.MetabaseBootstrap = settings;
  setupPropertiesEndpoints(settings);
  fetchMock.post("path:/api/frontend-errors", 200);
  fetchMock.post("path:/api/dataset", async ({ options }) => {
    const body: unknown = JSON.parse(String(options.body ?? "{}"));
    return getDataset(getSourceQuery(body)) ?? { status: 404 };
  });
}

function getSourceQuery(body: unknown) {
  if (!isObject(body)) {
    return null;
  }
  if (isObject(body.query)) {
    return body.query;
  }
  return Array.isArray(body.stages) ? body.stages[0] : null;
}

export function catchUnmatchedRequests() {
  fetchMock.catch(({ url, options }) => {
    if (!new URL(url, window.location.href).pathname.startsWith("/api/")) {
      return networkFetch(url, options);
    }
    console.warn(`[prototype mock api] unmatched request: ${url}`);
    return { status: 200, body: {} };
  });
}

const STORAGE_KEYS = {
  tableStructure: "metabase-prototype-table-structure",
  historyReview: "metabase-prototype-history-review",
} as const;

export function seedPrototypeStorage({
  tableStructure,
  historyReview,
}: Record<keyof typeof STORAGE_KEYS, Record<string, unknown>>) {
  window.localStorage.setItem(
    STORAGE_KEYS.tableStructure,
    JSON.stringify(tableStructure),
  );
  window.localStorage.setItem(
    STORAGE_KEYS.historyReview,
    JSON.stringify(historyReview),
  );
}
