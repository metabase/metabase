import Search from "metabase/entities/search";
import {
  CollectionItem,
  SearchListQuery,
  SearchResults,
} from "metabase-types/api";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";

export const useSearchListQuery = (
  props: UseEntityListQueryProps<SearchListQuery> = {},
): UseEntityListQueryResult<CollectionItem, Omit<SearchResults, "data">> => {
  return useEntityListQuery(props, {
    fetchList: Search.actions.fetchList,
    getList: Search.selectors.getList,
    getLoading: Search.selectors.getLoading,
    getLoaded: Search.selectors.getLoaded,
    getError: Search.selectors.getError,
    getListMetadata: Search.selectors.getListMetadata,
  });
};
