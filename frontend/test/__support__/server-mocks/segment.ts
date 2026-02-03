import fetchMock from "fetch-mock";

import type { Segment } from "metabase-types/api";
import { createMockSegment } from "metabase-types/api/mocks";

export function setupSegmentRevisionsEndpointError(segmentId: number) {
  fetchMock.get(`path:/api/revision?entity=segment&id=${segmentId}`, {
    status: 500,
    body: "Server error",
  });
}

export function setupSegmentEndpoint(segment: Segment) {
  fetchMock.get(`path:/api/segment/${segment.id}`, segment);
}

export function setupSegmentEndpointError(segmentId: number) {
  fetchMock.get(`path:/api/segment/${segmentId}`, {
    status: 500,
    body: "Segment not found",
  });
}

export function setupSegmentsEndpoints(segments: Segment[]) {
  fetchMock.post("path:/api/segment", async (call) => {
    const segment = await call.request?.json();
    return createMockSegment(segment);
  });
  fetchMock.get("path:/api/segment", segments);
  segments.forEach((segment) => setupSegmentEndpoint(segment));
}
