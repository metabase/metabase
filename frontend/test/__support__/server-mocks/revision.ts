import fetchMock from "fetch-mock";

import type { Revision } from "metabase-types/api";

export function setupRevisionsEndpoints(revisions: Revision[]) {
  fetchMock.get("path:/api/revision", revisions);
}

export function setupSegmentRevisionsEndpoint(
  segmentId: number,
  revisions: Revision[],
) {
  fetchMock.get(`path:/api/revision?entity=segment&id=${segmentId}`, revisions);
}

export function setupMeasureRevisionsEndpoint(
  measureId: number,
  revisions: Revision[],
) {
  fetchMock.get(`path:/api/revision?entity=measure&id=${measureId}`, revisions);
}
