import type { MappingsType } from "metabase/admin/types";
import {
  isAdminGroup,
  isDefaultGroup,
  isDefaultTenantGroup,
} from "metabase/common/utils/groups";
import type { GroupId, GroupListQuery } from "metabase-types/api";

export type JWTGroupSyncMode = "automatic" | "manual" | "off";

/** Rebuilds in place so a renamed mapping keeps its position in the list */
export function withMappingEntry(
  mappings: MappingsType,
  originalJwtGroupName: string | null,
  jwtGroupName: string,
  groupIds: GroupId[],
): MappingsType {
  const entries = Object.entries(mappings).map(
    ([mappingName, ids]): [string, GroupId[]] =>
      mappingName === originalJwtGroupName
        ? [jwtGroupName, groupIds]
        : [mappingName, ids],
  );
  if (originalJwtGroupName == null) {
    entries.push([jwtGroupName, groupIds]);
  }
  // fromEntries defines own properties, so names like __proto__ stay plain keys
  return Object.fromEntries(entries);
}

/** Drops one mapping and scrubs deleted group ids from the rest, since the backend keeps their ids */
export function withoutMapping(
  mappings: MappingsType,
  name: string,
  deletedGroupIds: GroupId[] = [],
): MappingsType {
  const deleted = new Set(deletedGroupIds);
  return Object.fromEntries(
    Object.entries(mappings)
      .filter(([mappingName]) => mappingName !== name)
      .map(([mappingName, ids]): [string, GroupId[]] => [
        mappingName,
        ids.filter((groupId) => !deleted.has(groupId)),
      ]),
  );
}

export type GroupLookup = ReturnType<typeof createGroupLookup>;

export function createGroupLookup(groups: GroupListQuery[]) {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const isAdminGroupId = (groupId: GroupId) => {
    const group = groupsById.get(groupId);
    return group != null && isAdminGroup(group);
  };
  return {
    // magic groups can't be mapped to
    mappableGroups: groups.filter(
      (group) => !isDefaultGroup(group) && !isDefaultTenantGroup(group),
    ),
    getGroup: (groupId: GroupId) => groupsById.get(groupId),
    existingIds: (groupIds: GroupId[]) =>
      groupIds.filter((groupId) => groupsById.has(groupId)),
    // cascades never touch the admin group, so it doesn't count as actionable
    actionableIds: (groupIds: GroupId[]) =>
      groupIds.filter(
        (groupId) => groupsById.has(groupId) && !isAdminGroupId(groupId),
      ),
    hasAdminGroup: (groupIds: GroupId[]) => groupIds.some(isAdminGroupId),
  };
}
