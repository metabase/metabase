import { skipToken } from "metabase/api/api";
import { useListCollectionDashboardQuestionCandidatesQuery } from "metabase/api/collection";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
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
