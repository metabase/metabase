import {
  skipToken,
  useListCollectionDashboardQuestionCandidatesQuery,
} from "metabase/api";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useSelector } from "metabase/utils/redux";
import type { CollectionId } from "metabase-types/api";

export const useHasDashboardQuestionCandidates = (
  collectionId: CollectionId,
) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const dqCandidatesReq = useListCollectionDashboardQuestionCandidatesQuery(
    isAdmin ? { collectionId, limit: 0 } : skipToken,
  );

  return (dqCandidatesReq.data?.total ?? 0) > 0;
};
