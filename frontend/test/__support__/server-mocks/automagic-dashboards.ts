import fetchMock from "fetch-mock";

import type { DatabaseXray, DatabaseId } from "metabase-types/api";

export function setupDatabaseCandidatesEndpoint(
  id: DatabaseId,
  candidates: DatabaseXray[],
) {
  fetchMock.get(
    `path:/api/automagic-dashboards/database/${id}/candidates`,
    candidates,
  );
}
