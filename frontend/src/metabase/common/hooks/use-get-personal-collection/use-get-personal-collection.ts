import { skipToken, useGetCollectionQuery } from "metabase/api";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import { useSelector } from "metabase/utils/redux";

/**
 * Hook that fetches the personal collection for the currently logged-in user.
 * Returns the RTK Query result with the collection data, loading state, and any errors.
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
