import RecentItems from "metabase/entities/recent-items";
import type { RecentItem } from "metabase-types/api";

import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";
import { useEntityListQuery } from "../use-entity-list-query";

/**
 * @deprecated use "metabase/api" instead
 */
export const useRecentItemListQuery = (
  props: UseEntityListQueryProps = {},
): UseEntityListQueryResult<RecentItem> => {
  return useEntityListQuery(props, {
    fetchList: RecentItems.actions.fetchList,
    getList: RecentItems.selectors.getList,
    getLoading: RecentItems.selectors.getLoading,
    getLoaded: RecentItems.selectors.getLoaded,
    getError: RecentItems.selectors.getError,
    getListMetadata: RecentItems.selectors.getListMetadata,
  });
};
