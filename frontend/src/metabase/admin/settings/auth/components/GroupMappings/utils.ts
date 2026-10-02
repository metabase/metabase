import {
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
  isDefaultTenantGroup,
} from "metabase/common/utils/groups";
import type {
  GroupId,
  GroupListQuery,
  GroupMappings,
} from "metabase-types/api";

import type { CascadeValue } from "./types";

export const EMPTY_MAPPINGS: GroupMappings = {};

/** Rebuilds in place so a renamed mapping keeps its position in the list */
export function withMappingEntry(
  mappings: GroupMappings,
  originalName: string | null,
  name: string,
  groupIds: GroupId[],
): GroupMappings {
  const entries = Object.entries(mappings).map(
    ([mappingName, ids]): [string, GroupId[]] =>
      mappingName === originalName ? [name, groupIds] : [mappingName, ids],
  );
  // an edit whose mapping was deleted meanwhile adds it back rather than vanishing
  if (originalName == null || !Object.hasOwn(mappings, originalName)) {
    entries.push([name, groupIds]);
  }
  // fromEntries defines own properties, so names like __proto__ stay plain keys
  return Object.fromEntries(entries);
}

export function withoutMapping(
  mappings: GroupMappings,
  name: string,
): GroupMappings {
  return Object.fromEntries(
    Object.entries(mappings).filter(([mappingName]) => mappingName !== name),
  );
}

/** Scrubs group ids from every mapping, since the backend keeps the ids of deleted groups in them */
export function withoutGroups(
  mappings: GroupMappings,
  groupIds: GroupId[],
): GroupMappings {
  const removed = new Set(groupIds);
  return Object.fromEntries(
    Object.entries(mappings).map(([mappingName, ids]): [string, GroupId[]] => [
      mappingName,
      ids.filter((groupId) => !removed.has(groupId)),
    ]),
  );
}

export type GroupLookup = ReturnType<typeof createGroupLookup>;

export function createGroupLookup(
  groups: GroupListQuery[] | undefined,
  loadFailed = false,
) {
  const loadedGroups = groups ?? [];
  const groupsById = new Map(loadedGroups.map((group) => [group.id, group]));
  // the backend refuses to delete any built-in group, and to clear Administrators, All Users and All tenant users
  const isKeptBy = (value: CascadeValue, group: GroupListQuery) => {
    if (value === "delete") {
      return group.magic_group_type != null;
    }
    return (
      isAdminGroup(group) ||
      isDefaultGroup(group) ||
      isDefaultTenantGroup(group)
    );
  };
  const existingGroups = (groupIds: GroupId[]) =>
    groupIds.flatMap((groupId) => groupsById.get(groupId) ?? []);
  return {
    // every id reads as missing until the groups arrive
    isLoaded: groups != null,
    loadFailed,
    mappableGroups: loadedGroups.filter(
      (group) => !isDefaultGroup(group) && !isDefaultTenantGroup(group),
    ),
    getGroup: (groupId: GroupId) => groupsById.get(groupId),
    existingIds: (groupIds: GroupId[]) =>
      groupIds.filter((groupId) => groupsById.has(groupId)),
    actionableIds: (groupIds: GroupId[], value: CascadeValue) =>
      existingGroups(groupIds)
        .filter((group) => !isKeptBy(value, group))
        .map((group) => group.id),
    actionableGroupNames: (groupIds: GroupId[], value: CascadeValue) =>
      existingGroups(groupIds)
        .filter((group) => !isKeptBy(value, group))
        .map((group) => getGroupNameLocalized(group)),
    keptGroupNames: (groupIds: GroupId[], value: CascadeValue) =>
      existingGroups(groupIds)
        .filter((group) => isKeptBy(value, group))
        .map((group) => getGroupNameLocalized(group)),
  };
}
