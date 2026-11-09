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

export function setupRevertRevisionErrorEndpoint({
  message,
}: {
  message: string;
}) {
  fetchMock.post("path:/api/revision/revert", {
    status: 500,
    body: { message },
  });
}

/**
 * Serves an entity's revisions and a revert endpoint that behaves like the real
 * API: a revert records `revertRevision` at the top of the list, and
 * `onRevert` is where the spec restores the entity's earlier version.
 */
export function setupRevertableRevisionsEndpoints({
  entity,
  id,
  revisions,
  revertRevision,
  onRevert,
}: {
  entity: RevisionEntityType;
  id: number | string;
  revisions: Revision[];
  revertRevision: Revision;
  onRevert: () => void;
}) {
  let current = revisions;
  fetchMock.get(`path:/api/revision?entity=${entity}&id=${id}`, () => current);
  fetchMock.post("path:/api/revision/revert", () => {
    current = [revertRevision, ...current];
    onRevert();
    return revertRevision;
  });
}
