import { skipToken } from "metabase/api/api";
import { useGetCollectionQuery } from "metabase/api/collection";
import { useSelector } from "metabase/redux";
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
