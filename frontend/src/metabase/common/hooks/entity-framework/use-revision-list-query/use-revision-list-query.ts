import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import Revisions from "metabase/entities/revisions";
import type { Revision, RevisionListQuery } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useRevisionListQuery = (
  props: UseEntityListQueryProps<RevisionListQuery> = {},
): UseEntityListQueryResult<Revision> => {
  return useEntityListQuery(props, {
    fetchList: Revisions.actions.fetchList,
    getList: Revisions.selectors.getList,
    getLoading: Revisions.selectors.getLoading,
    getLoaded: Revisions.selectors.getLoaded,
    getError: Revisions.selectors.getError,
    getListMetadata: Revisions.selectors.getListMetadata,
  });
};
