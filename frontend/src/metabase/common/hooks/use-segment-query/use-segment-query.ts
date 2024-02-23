import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import Segments from "metabase/entities/segments";
import Segment from "metabase-lib/metadata/Segment";
import { SegmentId } from "metabase-types/api";

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
