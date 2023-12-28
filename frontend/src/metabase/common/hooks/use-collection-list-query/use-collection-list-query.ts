import type { Collection, CollectionListQuery } from "metabase-types/api";
import Collections from "metabase/entities/collections";

import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";
import { useEntityListQuery } from "../use-entity-list-query";

export const useCollectionListQuery = (
  props: UseEntityListQueryProps<CollectionListQuery> = {},
): UseEntityListQueryResult<Collection> => {
  return useEntityListQuery(props, {
    fetchList: Collections.actions.fetchList,
    getError: Collections.selectors.getError,
    getList: Collections.selectors.getList,
    getLoaded: Collections.selectors.getLoaded,
    getLoading: Collections.selectors.getLoading,
    getListMetadata: Collections.selectors.getListMetadata,
  });
};
