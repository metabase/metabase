import _ from "underscore";

import type { Group } from "metabase-types/api";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";

const isPinnedGroup = (group: Group) =>
  isAdminGroup(group) || isDefaultGroup(group);

export const orderGroups = (groups: Group[]) => {
  return _.partition(groups, isPinnedGroup);
};
