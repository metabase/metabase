import { useListCollectionDashboardQuestionCandidatesQuery } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

// TODO: optimize w/ a limit = 0 once the endpoint supports this
export const useHasDashboardQuestionCandidates = (
  collectionId: CollectionId,
) => {
  const dqCandidatesReq =
    useListCollectionDashboardQuestionCandidatesQuery(collectionId);
  return (dqCandidatesReq.data?.count ?? 0) > 0;
};
