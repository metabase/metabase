import fetchMock from "fetch-mock";
import { DatabaseCandidate, DatabaseId } from "metabase-types/api";

export function setupDatabaseCandidatesEndpoint(
  id: DatabaseId,
  candidates: DatabaseCandidate[],
) {
  fetchMock.get(
    `path:/api/automagic-dashboards/database/${id}/candidates`,
    candidates,
  );
}
