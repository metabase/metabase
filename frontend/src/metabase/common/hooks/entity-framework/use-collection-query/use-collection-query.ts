import Collections from "metabase/entities/collections";
import type { Collection, CollectionId } from "metabase-types/api";

import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "../use-entity-query";
import { useEntityQuery } from "../use-entity-query";

/**
 * @deprecated use "metabase/api" instead
 */
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
