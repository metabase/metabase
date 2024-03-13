import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import Segments from "metabase/entities/segments";
import type Segment from "metabase-lib/v1/metadata/Segment";
import type { SegmentId } from "metabase-types/api";

export const useSegmentQuery = (
  props: UseEntityQueryProps<SegmentId>,
): UseEntityQueryResult<Segment> => {
  return useEntityQuery(props, {
    fetch: Segments.actions.fetch,
    getObject: Segments.selectors.getObject,
    getLoading: Segments.selectors.getLoading,
    getError: Segments.selectors.getError,
  });
};
