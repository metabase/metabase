import fetchMock from "fetch-mock";

import type { Revision } from "metabase-types/api";

export function setupRevisionsEndpoints(revisions: Revision[]) {
  fetchMock.get("path:/api/revision", revisions);
}
