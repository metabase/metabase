import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";

/**
 * Hook to determine if other users' collections are shown in the UI.
 * Returns true if the current user is an admin AND there are other users in the instance.
 */
export const useShowOtherUsersCollections = (): boolean => {
  const isAdmin = useSelector(getUserIsAdmin);
  const activeUsersCount = useSetting("active-users-count");
  const areThereOtherUsers = (activeUsersCount ?? 0) > 1;

  return isAdmin && areThereOtherUsers;
};
