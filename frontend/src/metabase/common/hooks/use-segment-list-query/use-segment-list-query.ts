import Segments from "metabase/entities/segments";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import Segment from "metabase-lib/metadata/Segment";

export const useSegmentListQuery = (
  props: UseEntityListQueryProps = {},
): UseEntityListQueryResult<Segment> => {
  return useEntityListQuery(props, {
    fetchList: Segments.actions.fetchList,
    getList: Segments.selectors.getList,
    getLoading: Segments.selectors.getLoading,
    getError: Segments.selectors.getError,
  });
};
