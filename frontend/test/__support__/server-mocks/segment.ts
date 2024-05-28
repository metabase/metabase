import fetchMock from "fetch-mock";

import type { Segment } from "metabase-types/api";
import { createMockSegment } from "metabase-types/api/mocks";

export function setupSegmentEndpoint(segment: Segment) {
  fetchMock.get(`path:/api/segment/${segment.id}`, segment);
}

export function setupSegmentsEndpoints(segments: Segment[]) {
  fetchMock.post("path:/api/segment", async url => {
    const metric = await fetchMock.lastCall(url)?.request?.json();
    return createMockSegment(metric);
  });
  fetchMock.get("path:/api/segment", segments);
  segments.forEach(segment => setupSegmentEndpoint(segment));
}
