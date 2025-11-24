import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import { GroupSummary } from "metabase/admin/people/components/GroupSummary";
import type {
  GroupIds,
  UserGroupType,
  UserGroupsType,
} from "metabase/admin/types";
import CS from "metabase/css/core/index.css";
import {
  canEditMembership,
  getGroupColor,
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { Box, Checkbox, Icon, Popover, Stack, Text } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

type GroupSelectProps = {
  groups: GroupInfo[];
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
  const topGroups = [defaultGroup, adminGroup].filter(
    (g): g is UserGroupType => g != null,
  );
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
  const [opened, { toggle, close }] = useDisclosure(false);

  const handleCheckboxChange = (group: UserGroupType, checked: boolean) => {
    onGroupChange(group, checked);
  };

  const isOptionDisabled = (group: UserGroupType) =>
    (isAdminGroup(group) && isCurrentUser) || !canEditMembership(group);

  const triggerElement = (
    <Box
      onClick={toggle}
      className={cx(CS.flex, CS.alignCenter, CS.cursorPointer)}
    >
      <GroupSummary
        mr="0.5rem"
        groups={groups}
        selectedGroupIds={selectedGroupIds}
      />
      <Icon className={CS.textLight} name="chevrondown" size={10} />
    </Box>
  );

  if (groups.length === 0) {
    return (
      <Popover opened={opened} onClose={close}>
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
    <Popover opened={opened} onClose={close}>
      <Popover.Target>{triggerElement}</Popover.Target>
      <Popover.Dropdown p="sm">
        <Stack gap="xs">
          {sections.map((section, sectionIndex) => (
            <Box key={sectionIndex}>
              {section.name && (
                <Text size="xs" fw={700} c="text-medium" mb="xs">
                  {section.name}
                </Text>
              )}
              <Stack gap="xs">
                {section.items.map((group) => {
                  const isDisabled = isOptionDisabled(group);
                  const isChecked = selectedGroupIds.includes(group.id);
                  const color = getGroupColor(group);

                  return (
                    <Checkbox
                      key={group.id}
                      label={
                        <Text c={color} size="sm">
                          {getGroupNameLocalized(group)}
                        </Text>
                      }
                      checked={isChecked}
                      disabled={isDisabled}
                      onChange={(event) =>
                        handleCheckboxChange(group, event.currentTarget.checked)
                      }
                    />
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default GroupSelect;
