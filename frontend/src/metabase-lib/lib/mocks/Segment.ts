import Segment, {
  HydratedSegmentProperties,
} from "metabase-lib/lib/metadata/Segment";
import { ISegment } from "metabase-types/api";
import { createMockSegment } from "metabase-types/api/mocks";

import { PRODUCTS, metadata } from "__support__/sample_database_fixture";

export function createMockSegmentInstance(
  segmentProps?: Partial<ISegment>,
  hydratedProps?: Partial<HydratedSegmentProperties>,
): Segment {
  const segment = createMockSegment(segmentProps);
  const instance = new Segment(segment);

  instance.table = PRODUCTS;
  instance.metadata = metadata;

  return Object.assign(instance, hydratedProps);
}
