import { skipToken, useGetCollectionQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

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
