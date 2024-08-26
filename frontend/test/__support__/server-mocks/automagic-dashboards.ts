import fetchMock from "fetch-mock";

import type { DatabaseId, DatabaseXray } from "metabase-types/api";

export function setupDatabaseCandidatesEndpoint(
  id: DatabaseId,
  candidates: DatabaseXray[],
) {
  fetchMock.get(
    `path:/api/automagic-dashboards/database/${id}/candidates`,
    candidates,
  );
}
