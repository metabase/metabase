import PopularItems from "metabase/entities/popular-items";
import { PopularItem } from "metabase-types/api";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";

export const usePopularItemListQuery = (
  props: UseEntityListQueryProps = {},
): UseEntityListQueryResult<PopularItem> => {
  return useEntityListQuery(props, {
    fetchList: PopularItems.actions.fetchList,
    getList: PopularItems.selectors.getList,
    getLoading: PopularItems.selectors.getLoading,
    getLoaded: PopularItems.selectors.getLoaded,
    getError: PopularItems.selectors.getError,
  });
};
