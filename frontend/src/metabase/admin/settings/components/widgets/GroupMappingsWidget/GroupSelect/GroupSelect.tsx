import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { GroupSummary } from "metabase/admin/people/components/GroupSummary";
import type {
  GroupIds,
  UserGroupType,
  UserGroupsType,
} from "metabase/admin/types";
import Select from "metabase/common/components/Select";
import {
  canEditMembership,
  getGroupColor,
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { Flex, Icon, Popover, Text } from "metabase/ui";

type GroupSelectProps = {
  groups: UserGroupsType;
  selectedGroupIds: GroupIds;
  onGroupChange: (group: UserGroupType, selected: boolean) => void;
  isCurrentUser?: boolean;
  emptyListMessage?: string;
};

type GroupSection = {
  name?: string;
  items: UserGroupsType;
};

function getSections(groups: UserGroupsType): GroupSection[] {
  const adminGroup = groups.find(isAdminGroup);
  const defaultGroup = groups.find(isDefaultGroup);
  const topGroups = [defaultGroup, adminGroup].filter(isNotNull);
  const groupsExceptDefaultAndAdmin = groups.filter(
    (g) => !isAdminGroup(g) && !isDefaultGroup(g),
  );

  if (topGroups.length === 0) {
    return [{ items: groupsExceptDefaultAndAdmin }];
  }

  const sections: GroupSection[] = [{ items: topGroups }];

  if (groupsExceptDefaultAndAdmin.length > 0) {
    sections.push({
      items: groupsExceptDefaultAndAdmin,
      name: t`Groups`,
    });
  }

  return sections;
}

export const GroupSelect = ({
  groups,
  selectedGroupIds = [],
  onGroupChange,
  isCurrentUser = false,
  emptyListMessage = t`No groups`,
}: GroupSelectProps) => {
  const [opened, { toggle }] = useDisclosure(false);

  const triggerElement = (
    <Flex onClick={toggle} align="center" style={{ cursor: "pointer" }}>
      <GroupSummary
        mr="0.5rem"
        groups={groups}
        selectedGroupIds={selectedGroupIds}
      />
      <Icon c="text-light" name="chevrondown" size={10} />
    </Flex>
  );

  if (groups.length === 0) {
    return (
      <Popover opened={opened} onChange={toggle}>
        <Popover.Target>{triggerElement}</Popover.Target>
        <Popover.Dropdown>
          <Text p="sm" c="text-medium">
            {emptyListMessage}
          </Text>
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
      optionDisabledFn={(group: UserGroupType) =>
        (isAdminGroup(group) && isCurrentUser) || !canEditMembership(group)
      }
      optionValueFn={(group: UserGroupType) => group.id}
      optionNameFn={getGroupNameLocalized}
      optionStylesFn={(group: UserGroupType) => ({
        color: getGroupColor(group),
      })}
      value={selectedGroupIds}
      sections={sections}
      multiple
    />
  );
};
