import Search from "metabase/entities/search";
import type {
  CollectionItem,
  SearchRequest,
  SearchResponse,
} from "metabase-types/api";

import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";
import { useEntityListQuery } from "../use-entity-list-query";

/**
 * @deprecated use "metabase/api" instead
 */
export const useSearchListQuery = <
  TItem = CollectionItem,
  TResult = Omit<SearchResponse, "data">,
>(
  props: UseEntityListQueryProps<SearchRequest> = {},
): UseEntityListQueryResult<TItem, TResult> => {
  return useEntityListQuery(props, {
    fetchList: Search.actions.fetchList,
    getList: Search.selectors.getList,
    getLoading: Search.selectors.getLoading,
    getLoaded: Search.selectors.getLoaded,
    getError: Search.selectors.getError,
    getListMetadata: Search.selectors.getListMetadata,
  });
};
