import Segments from "metabase/entities/segments";
import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { SegmentId } from "metabase-types/api";
import Segment from "metabase-lib/metadata/Segment";

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
