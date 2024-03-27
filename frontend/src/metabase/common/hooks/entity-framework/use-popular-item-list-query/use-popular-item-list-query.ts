import PopularItems from "metabase/entities/popular-items";
import type { PopularItem } from "metabase-types/api";

import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";
import { useEntityListQuery } from "../use-entity-list-query";

/**
 * @deprecated use "metabase/api" instead
 */
export const usePopularItemListQuery = (
  props: UseEntityListQueryProps = {},
): UseEntityListQueryResult<PopularItem> => {
  return useEntityListQuery(props, {
    fetchList: PopularItems.actions.fetchList,
    getList: PopularItems.selectors.getList,
    getLoading: PopularItems.selectors.getLoading,
    getLoaded: PopularItems.selectors.getLoaded,
    getError: PopularItems.selectors.getError,
    getListMetadata: PopularItems.selectors.getListMetadata,
  });
};
