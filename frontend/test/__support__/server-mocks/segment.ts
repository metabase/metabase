import fetchMock from "fetch-mock";
import { Segment } from "metabase-types/api";

export function setupSegmentEndpoint(segment: Segment) {
  fetchMock.get(`path:/api/segment/${segment.id}`, segment);
}

export function setupSegmentsEndpoints(segments: Segment[]) {
  fetchMock.get(`path:/api/segment`, segments);
  segments.forEach(segment => setupSegmentEndpoint(segment));
}
