import fetchMock from "fetch-mock";

import type { Card, DatabaseId } from "metabase-types/api";

export function setupMetabotModelEndpoint(
  modelId: number,
  card: Card,
  overwriteRoutes = false,
) {
  fetchMock.post(
    `path:/api/metabot/model/${modelId}`,
    {
      card,
      prompt_template_versions: [],
    },
    { overwriteRoutes },
  );
}

export function setupMetabotDatabaseEndpoint(
  databaseId: DatabaseId,
  card: Card,
) {
  fetchMock.post(`path:/api/metabot/database/${databaseId}`, {
    card,
    prompt_template_versions: [],
  });
}

export const API_ERROR = "Unable to generate a query from the prompt";

export function setupBadRequestMetabotModelEndpoint(modelId: number) {
  fetchMock.post(`path:/api/metabot/model/${modelId}`, {
    status: 401,
    body: API_ERROR,
  });
}

export function setupBadRequestMetabotDatabaseEndpoint(databaseId: DatabaseId) {
  fetchMock.post(`path:/api/metabot/database/${databaseId}`, {
    status: 401,
    body: API_ERROR,
  });
}
