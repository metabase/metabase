import DatabaseCandidates from "metabase/entities/database-candidates";
import {
  DatabaseCandidateListQuery,
  DatabaseCandidate,
} from "metabase-types/api";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "../use-entity-list-query";

export const useDatabaseCandidateListQuery = (
  props: UseEntityListQueryProps<DatabaseCandidateListQuery> = {},
): UseEntityListQueryResult<DatabaseCandidate> => {
  return useEntityListQuery(props, {
    fetchList: DatabaseCandidates.actions.fetchList,
    getList: DatabaseCandidates.selectors.getList,
    getLoading: DatabaseCandidates.selectors.getLoading,
    getLoaded: DatabaseCandidates.selectors.getLoaded,
    getError: DatabaseCandidates.selectors.getError,
  });
};
