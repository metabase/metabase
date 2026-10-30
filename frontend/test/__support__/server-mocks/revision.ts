import fetchMock from "fetch-mock";

import type { Revision, RevisionEntityType } from "metabase-types/api";

export function setupRevisionsEndpoints(revisions: Revision[]) {
  fetchMock.get("path:/api/revision", revisions);
}

export function setupEntityRevisionsEndpoint(
  entity: RevisionEntityType,
  id: number | string,
  revisions: Revision[],
) {
  fetchMock.get(`path:/api/revision?entity=${entity}&id=${id}`, revisions);
}

export function setupRevertRevisionEndpoint(revision: Revision) {
  fetchMock.post("path:/api/revision/revert", revision);
}
