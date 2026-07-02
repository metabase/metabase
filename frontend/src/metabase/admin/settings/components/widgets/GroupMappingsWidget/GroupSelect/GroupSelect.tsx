import { Fragment } from "react";
import { t } from "ttag";

import { GroupSummary } from "metabase/admin/people/components/GroupSummary";
import type { GroupIds, UserGroupType } from "metabase/admin/types";
import {
  canEditMembership,
  getGroupNameLocalized,
  isAdminGroup,
  isDefaultGroup,
} from "metabase/admin/utils/groups";
import {
  Box,
  Checkbox,
  Combobox,
  Flex,
  Icon,
  UnstyledButton,
  rem,
  useCombobox,
} from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { GroupInfo } from "metabase-types/api";

import S from "./GroupSelect.module.css";

function getGroupColor(group: Pick<GroupInfo, "magic_group_type">) {
  if (isAdminGroup(group)) {
    return "var(--mb-color-core-filter)";
  }
  if (isDefaultGroup(group)) {
    return "var(--mb-color-text-secondary)";
  }
  return "var(--mb-color-text-primary)";
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
  const topGroups = [defaultGroup, adminGroup].filter(isNotNull);
  const groupsExceptDefaultAndAdmin = groups.filter(
    (group) => !isAdminGroup(group) && !isDefaultGroup(group),
  );

  if (topGroups.length === 0) {
    return [{ items: groupsExceptDefaultAndAdmin }];
  }

  return [
    { items: topGroups },
    groupsExceptDefaultAndAdmin.length > 0
      ? { items: groupsExceptDefaultAndAdmin, name: t`Groups` }
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
  const combobox = useCombobox();

  const handleOptionSubmit = (value: string) => {
    const groupId = Number(value);
    const group = groups.find((candidate) => candidate.id === groupId);
    if (group == null) {
      return;
    }
    onGroupChange(group, !selectedGroupIds.includes(groupId));
  };

  const sections = getSections(groups);

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      width={rem(240)}
      classNames={{ groupLabel: S.groupLabel }}
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <UnstyledButton onClick={() => combobox.toggleDropdown()}>
          <Flex align="center">
            <GroupSummary
              mr="sm"
              groups={groups}
              selectedGroupIds={selectedGroupIds}
            />
            <Icon c="text-disabled" name="chevrondown" size={10} />
          </Flex>
        </UnstyledButton>
      </Combobox.Target>

      <Combobox.Dropdown>
        {groups.length === 0 ? (
          <Box p="sm">{emptyListMessage}</Box>
        ) : (
          <Combobox.Options>
            {sections.map((section, index) => {
              const options = section.items.map((group) => (
                <Combobox.Option
                  key={group.id}
                  value={String(group.id)}
                  aria-label={getGroupNameLocalized(group)}
                  disabled={
                    (isAdminGroup(group) && isCurrentUser) ||
                    !canEditMembership(group)
                  }
                >
                  <Flex align="center" gap="sm">
                    <Checkbox
                      checked={selectedGroupIds.includes(group.id)}
                      readOnly
                      aria-hidden
                      tabIndex={-1}
                      style={{ pointerEvents: "none" }}
                    />
                    <span style={{ color: getGroupColor(group) }}>
                      {getGroupNameLocalized(group)}
                    </span>
                  </Flex>
                </Combobox.Option>
              ));

              return "name" in section ? (
                <Combobox.Group key={index} label={section.name}>
                  {options}
                </Combobox.Group>
              ) : (
                <Fragment key={index}>{options}</Fragment>
              );
            })}
          </Combobox.Options>
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
};
