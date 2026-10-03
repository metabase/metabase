import {
  isAdminGroup,
  isDefaultGroup,
  isDefaultTenantGroup,
} from "metabase/common/utils/groups";
import type { GroupInfo } from "metabase-types/api";

import type { GroupTab } from "./types";

export function getVisibleGroups(
  groups: GroupInfo[],
  advanced: boolean,
  activeTab: GroupTab,
): GroupInfo[] {
  if (advanced) {
    return groups.filter(
      (group) => !isDefaultGroup(group) && !isDefaultTenantGroup(group),
    );
  }

  if (activeTab === "tenant-groups") {
    return groups.filter(
      (group) => isAdminGroup(group) || isDefaultTenantGroup(group),
    );
  }

  return groups.filter((group) => isAdminGroup(group) || isDefaultGroup(group));
}
