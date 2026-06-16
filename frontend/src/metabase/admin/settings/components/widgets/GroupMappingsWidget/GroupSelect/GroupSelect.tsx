import { t } from "ttag";

import { GroupSummary } from "metabase/admin/people/components/GroupSummary";
import type { GroupIds, UserGroupType } from "metabase/admin/types";
import {
  canEditMembership,
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/admin/utils/groups";
import { Select } from "metabase/common/components/Select";
import { Box, Flex, Icon, Popover } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { GroupInfo } from "metabase-types/api";

function getGroupColor(group: Pick<GroupInfo, "magic_group_type">) {
  if (isAdminGroup(group)) {
    return "var(--mb-color-core-filter)";
  }
  if (isDefaultGroup(group)) {
    return "var(--mb-color-text-secondary)";
  }
  return "var(--mb-color-core-brand)";
}

type GroupSelectProps = {
  groups: GroupInfo[];
  selectedGroupIds: GroupIds;
  onGroupChange: (group: UserGroupType, selected: boolean) => void;
  isCurrentUser?: boolean;
  emptyListMessage?: string;
};

function getSections(groups: GroupInfo[]) {
  const adminGroup = groups.find(isAdminGroup);
  const defaultGroup = groups.find(isDefaultGroup);
  const topGroups = [defaultGroup, adminGroup].filter((g) => g != null);
  const groupsExceptDefaultAndAdmin = groups.filter(
    (g) => !isAdminGroup(g) && !isDefaultGroup(g),
  );

  if (topGroups.length === 0) {
    return [{ items: groupsExceptDefaultAndAdmin }];
  }

  return [
    { items: topGroups },
    groupsExceptDefaultAndAdmin.length > 0
      ? {
          items: groupsExceptDefaultAndAdmin as any,
          name: t`Groups`,
        }
      : null,
  ].filter(isNotNull);
}

export const GroupSelect = ({
  groups,
  selectedGroupIds = [],
  onGroupChange,
  isCurrentUser = false,
  emptyListMessage = t`No groups`,
}: GroupSelectProps) => {
  const triggerElement = (
    <Flex align="center">
      <GroupSummary
        mr="0.5rem"
        groups={groups}
        selectedGroupIds={selectedGroupIds}
      />
      <Icon c="text-tertiary" name="chevrondown" size={10} />
    </Flex>
  );

  if (groups.length === 0) {
    return (
      <Popover withinPortal={false} position="bottom-start">
        <Popover.Target>{triggerElement}</Popover.Target>
        <Popover.Dropdown style={{ boxSizing: "border-box" }}>
          <Box p="sm">{emptyListMessage}</Box>
        </Popover.Dropdown>
      </Popover>
    );
  }

  const sections = getSections(groups);

  return (
    <Select
      triggerElement={triggerElement}
      onChange={({ target: { value } }: { target: { value: any } }) => {
        groups
          .filter(
            // find the differing groups between the new `value` on previous `selectedGroupIds`
            (group) =>
              (selectedGroupIds.includes(group.id) as any) ^
              value.includes(group.id),
          )
          .forEach((group) => onGroupChange(group, value.includes(group.id)));
      }}
      optionDisabledFn={(group: GroupInfo) =>
        (isAdminGroup(group) && isCurrentUser) || !canEditMembership(group)
      }
      optionValueFn={(group: GroupInfo) => group.id}
      optionNameFn={getGroupNameLocalized}
      optionStylesFn={(group: GroupInfo) => ({
        color: getGroupColor(group),
      })}
      value={selectedGroupIds}
      sections={sections}
      multiple
    />
  );
};
