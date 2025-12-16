import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListPermissionsGroupsQuery } from "metabase/api/permission";
import { getGroupNameLocalized, isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { PLUGIN_TENANTS } from "metabase/plugins";
import type { IconName } from "metabase/ui";
import type { GroupId, GroupInfo } from "metabase-types/api";

type GroupSidebarItem = {
  id: GroupId;
  name: string;
  icon: IconName;
};

export type GroupsSidebarData = {
  selectedId?: GroupId;
  entityGroups: GroupSidebarItem[][];
  entityViewFocus: "group";
  filterPlaceholder: string;
};

const isPinnedGroup = (group: GroupInfo) =>
  isAdminGroup(group) || isDefaultGroup(group);

function getOrderedGroups(groups: GroupInfo[]): GroupInfo[][] {
  const [pinnedGroups, unpinnedGroups] = _.partition(groups, isPinnedGroup);
  return [
    pinnedGroups,
    ..._.partition(unpinnedGroups, PLUGIN_TENANTS.isTenantGroup),
  ];
}

type UseGroupsPermissionsSidebarParams = {
  selectedGroupId?: GroupId | null;
};

export function useGroupsPermissionsSidebar({
  selectedGroupId,
}: UseGroupsPermissionsSidebarParams): {
  sidebar: GroupsSidebarData | null;
  isLoading: boolean;
} {
  const { data: groups, isLoading } = useListPermissionsGroupsQuery({});

  const sidebar = useMemo((): GroupsSidebarData | null => {
    if (!groups) {
      return null;
    }

    const [pinnedGroups, externalGroups, internalGroups] = getOrderedGroups(groups);

    const pinnedGroupItems: GroupSidebarItem[] = pinnedGroups.map((group) => ({
      id: group.id,
      name: getGroupNameLocalized(group),
      icon: "bolt",
    }));

    const internalGroupItems: GroupSidebarItem[] = (internalGroups ?? []).map((group) => ({
      id: group.id,
      name: getGroupNameLocalized(group),
      icon: "group",
    }));

    const externalGroupItems: GroupSidebarItem[] = (externalGroups ?? []).map((group) => ({
      id: group.id,
      name: getGroupNameLocalized(group),
      icon: group.magic_group_type ? "bolt" : "globe",
    }));

    const entityGroups = [
      pinnedGroupItems,
      internalGroupItems,
      externalGroupItems,
    ].filter((items) => items.length > 0);

    return {
      selectedId: selectedGroupId ?? undefined,
      entityGroups,
      entityViewFocus: "group",
      filterPlaceholder: t`Search for a group`,
    };
  }, [groups, selectedGroupId]);

  return {
    sidebar,
    isLoading,
  };
}
