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
};

const networkFetch = window.fetch.bind(window);

// PROTOTYPE: answers the API from fixtures so stories run without a backend
export function setupMockApi({
  database,
  fieldValues,
  getDataset,
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
  setupLibraryEndpoints();
  setupFieldsValuesEndpoints(fieldValues);
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures(),
  });
  window.MetabaseBootstrap = settings;
  setupPropertiesEndpoints(settings);
  fetchMock.post("path:/api/frontend-errors", 200);
  fetchMock.post("path:/api/dataset", async ({ options }) => {
    const body: unknown = JSON.parse(String(options.body ?? "{}"));
    const query = isObject(body) ? body.query : null;
    return getDataset(query) ?? { status: 404 };
  });
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

const PROPERTY_REGISTRY_STORAGE_KEY = "metabase-prototype-property-registry";
const TABLE_STRUCTURE_STORAGE_KEY = "metabase-prototype-table-structure";

export function seedPrototypeStorage({
  registry,
  tableStructure,
}: {
  registry: Record<string, unknown>;
  tableStructure: Record<string, unknown>;
}) {
  window.localStorage.setItem(
    PROPERTY_REGISTRY_STORAGE_KEY,
    JSON.stringify(registry),
  );
  window.localStorage.setItem(
    TABLE_STRUCTURE_STORAGE_KEY,
    JSON.stringify(tableStructure),
  );
}
