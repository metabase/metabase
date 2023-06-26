import RecentItems from "metabase/entities/recent-items";
import { RecentItem } from "metabase-types/api";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";

export const useRecentItemListQuery = (
  props: UseEntityListQueryProps = {},
): UseEntityListQueryResult<RecentItem> => {
  return useEntityListQuery(props, {
    fetchList: RecentItems.actions.fetchList,
    getList: RecentItems.selectors.getList,
    getLoading: RecentItems.selectors.getLoading,
    getLoaded: RecentItems.selectors.getLoaded,
    getError: RecentItems.selectors.getError,
  });
};
