import DatabaseCandidates from "metabase/entities/database-candidates";
import type {
  DatabaseCandidateListQuery,
  DatabaseCandidate,
} from "metabase-types/api";

import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";
import { useEntityListQuery } from "../use-entity-list-query";

/**
 * @deprecated use "metabase/api" instead
 */
export const useDatabaseCandidateListQuery = (
  props: UseEntityListQueryProps<DatabaseCandidateListQuery> = {},
): UseEntityListQueryResult<DatabaseCandidate> => {
  return useEntityListQuery(props, {
    fetchList: DatabaseCandidates.actions.fetchList,
    getList: DatabaseCandidates.selectors.getList,
    getLoading: DatabaseCandidates.selectors.getLoading,
    getLoaded: DatabaseCandidates.selectors.getLoaded,
    getError: DatabaseCandidates.selectors.getError,
    getListMetadata: DatabaseCandidates.selectors.getListMetadata,
  });
};
