import { useMemo } from "react";

import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import { getUserName } from "metabase/utils/user";

export const DEFAULT_DATE = "past30days";
export const DEFAULT_GROUP = "1"; // All Users group

export function useFilterOptions() {
  const { data: usersData, isLoading: isLoadingUsers } = useListUsersQuery({});
  const { data: groupsData, isLoading: isLoadingGroups } =
    useListPermissionsGroupsQuery(undefined);

  const userOptions = useMemo(
    () =>
      (usersData?.data ?? []).map((u) => ({
        value: String(u.id),
        label: getUserName(u) || String(u.id),
      })),
    [usersData],
  );

  const groupOptions = useMemo(() => {
    const groups = (groupsData ?? []).map((g) => ({
      value: String(g.id),
      label: g.name,
    }));
    const defaultGroup = groups.find((g) => g.value === DEFAULT_GROUP);
    const rest = groups.filter((g) => g.value !== DEFAULT_GROUP);
    return defaultGroup ? [defaultGroup, ...rest] : groups;
  }, [groupsData]);

  return {
    userOptions,
    groupOptions,
    isLoading: isLoadingUsers || isLoadingGroups,
  };
}
