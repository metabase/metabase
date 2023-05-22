import RevisionEntity from "metabase/entities/revisions";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import type { Revision, RevisionListQuery } from "metabase-types/api";

export const useRevisionListQuery = (
  props: UseEntityListQueryProps<RevisionListQuery> = {},
): UseEntityListQueryResult<Revision> => {
  return useEntityListQuery(props, {
    fetchList: RevisionEntity.actions.fetchList,
    getList: RevisionEntity.selectors.getList,
    getLoading: RevisionEntity.selectors.getLoading,
    getError: RevisionEntity.selectors.getError,
  });
};
