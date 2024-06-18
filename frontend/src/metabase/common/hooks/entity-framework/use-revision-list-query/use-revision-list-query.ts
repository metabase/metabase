import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import RevisionEntity from "metabase/entities/revisions";
import type { Revision, RevisionListQuery } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useRevisionListQuery = (
  props: UseEntityListQueryProps<RevisionListQuery> = {},
): UseEntityListQueryResult<Revision> => {
  return useEntityListQuery(props, {
    fetchList: RevisionEntity.actions.fetchList,
    getList: RevisionEntity.selectors.getList,
    getLoading: RevisionEntity.selectors.getLoading,
    getLoaded: RevisionEntity.selectors.getLoaded,
    getError: RevisionEntity.selectors.getError,
    getListMetadata: RevisionEntity.selectors.getListMetadata,
  });
};
