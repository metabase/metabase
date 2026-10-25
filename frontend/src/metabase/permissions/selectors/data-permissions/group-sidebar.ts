import { t } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import type { GroupId, GroupInfo } from "metabase-types/api";

import type { PermissionsSidebarContentProps } from "../../components/PermissionsSidebar/PermissionsSidebarContent";

import { getOrderedGroups } from "./groups";

export type GroupSidebarProps = Pick<
  PermissionsSidebarContentProps,
  "selectedId" | "entityGroups" | "entityViewFocus" | "filterPlaceholder"
>;

export const getGroupsSidebar = (
  groups: GroupInfo[],
  groupId: GroupId | undefined,
): GroupSidebarProps => {
  const [pinnedGroups, externalGroups, internalGroups] =
    getOrderedGroups(groups);

  const pinnedGroupItems = pinnedGroups.map((group) => ({
    ...group,
    name: getGroupNameLocalized(group),
    icon: "bolt" as const,
  }));

  const internalGroupItems = internalGroups.map((group) => ({
    ...group,
    name: getGroupNameLocalized(group),
    icon: "group" as const,
  }));

  const externalGroupItems = externalGroups.map((group) => ({
    ...group,
    name: getGroupNameLocalized(group),
    icon: group.magic_group_type ? ("bolt" as const) : ("globe" as const),
  }));

  const entityGroups = [
    pinnedGroupItems,
    internalGroupItems,
    externalGroupItems,
  ].filter((groups) => groups.length > 0);

  return {
    selectedId: groupId ?? undefined,
    entityGroups,
    entityViewFocus: "group",
    filterPlaceholder: t`Search for a group`,
  };
};
