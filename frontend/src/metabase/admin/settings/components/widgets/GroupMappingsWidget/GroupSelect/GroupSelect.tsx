import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { GroupSummary } from "metabase/admin/people/components/GroupSummary";
import type { GroupIds } from "metabase/admin/types";
import {
  canEditMembership,
  getGroupColor,
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/lib/groups";
import { isNotNull } from "metabase/lib/types";
import { Box, Checkbox, Flex, Icon, Popover, Stack, Text } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

type GroupSelectProps = {
  groups: GroupInfo[];
  selectedGroupIds: GroupIds;
  onGroupChange: (group: GroupInfo, selected: boolean) => void;
  isCurrentUser?: boolean;
  emptyListMessage?: string;
};

type GroupSection = {
  name?: string;
  items: GroupInfo[];
};

function getSections(groups: GroupInfo[]): GroupSection[] {
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

  const handleCheckboxChange = (group: GroupInfo, checked: boolean) => {
    onGroupChange(group, checked);
  };

  const isOptionDisabled = (group: GroupInfo) =>
    (isAdminGroup(group) && isCurrentUser) || !canEditMembership(group);

  const triggerElement = (
    <Flex onClick={toggle} align="center" style={{ cursor: "pointer" }}>
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
      <Popover opened={opened} onChange={toggle}>
        <Popover.Target>{triggerElement}</Popover.Target>
        <Popover.Dropdown>
          <Text p="sm" c="text-secondary">
            {emptyListMessage}
          </Text>
        </Popover.Dropdown>
      </Popover>
    );
  }

  const sections = getSections(groups);

  return (
    <Popover opened={opened} onChange={toggle}>
      <Popover.Target>{triggerElement}</Popover.Target>
      <Popover.Dropdown p="sm" w={200}>
        <Stack gap="xs">
          {sections.map((section, sectionIndex) => (
            <Box key={sectionIndex}>
              {section.name && (
                <Text size="md" fw={700} c="text-secondary" mb="xs">
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
                      size="md"
                      label={
                        <Text c={color} size="md">
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
