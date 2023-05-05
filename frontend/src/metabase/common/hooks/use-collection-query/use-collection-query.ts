import Collections from "metabase/entities/collections";
import { Collection, CollectionId } from "metabase-types/api";
import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "../use-entity-query";

export const useCollectionQuery = (
  props: UseEntityQueryProps<CollectionId, unknown>,
): UseEntityQueryResult<Collection> => {
  return useEntityQuery(props, {
    fetch: Collections.actions.fetch,
    getObject: Collections.selectors.getObject,
    getLoading: Collections.selectors.getLoading,
    getError: Collections.selectors.getError,
  });
};
