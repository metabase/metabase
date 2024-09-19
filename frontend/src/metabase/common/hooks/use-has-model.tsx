import { skipToken, useGetCurrentUserQuery } from "metabase/api";

// check if the user has access to any model
export const useHasModel = (
  { enabled }: { enabled?: boolean } = { enabled: true },
) => {
  const { data: currentUser } = useGetCurrentUserQuery(
    enabled ? undefined : skipToken,
  );
  return !!currentUser?.has_model;
};
