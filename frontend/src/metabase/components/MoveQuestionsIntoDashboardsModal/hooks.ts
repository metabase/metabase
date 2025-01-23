import {
  skipToken,
  useListCollectionDashboardQuestionCandidatesQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { CollectionId } from "metabase-types/api";

// TODO: optimize w/ a limit = 0 once the endpoint supports this
export const useHasDashboardQuestionCandidates = (
  collectionId: CollectionId,
) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const dqCandidatesReq = useListCollectionDashboardQuestionCandidatesQuery(
    isAdmin ? collectionId : skipToken,
  );
  return (dqCandidatesReq.data?.count ?? 0) > 0;
};
