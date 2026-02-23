import { skipToken, useGetCollectionQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

/**
 * gets the personal collection for the current user
 */
export const useGetPersonalCollection = () => {
  const personalCollectionId = useSelector(getUserPersonalCollectionId);
  const response = useGetCollectionQuery(
    personalCollectionId
      ? {
          id: personalCollectionId,
        }
      : skipToken,
  );

  return response;
};
