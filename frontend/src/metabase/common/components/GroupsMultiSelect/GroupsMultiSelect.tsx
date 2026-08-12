import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import {
  canEditMembership,
  getGroupNameLocalized,
  getGroupSortOrder,
  isAdminGroup,
  isDataAnalystGroup,
  isDefaultGroup,
} from "metabase/common/utils/groups";
import { PLUGIN_GROUP_MANAGERS, PLUGIN_TENANTS } from "metabase/plugins";
import {
  Box,
  Checkbox,
  Combobox,
  Divider,
  Flex,
  Pill,
  PillsInput,
  useCombobox,
} from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { GroupId, GroupInfo } from "metabase-types/api";

import S from "./GroupsMultiSelect.module.css";

export interface GroupSection {
  label: string;
  groupIds: GroupId[];
}

interface GroupsMultiSelectProps {
  groups: GroupInfo[];
  value: GroupId[];
  onChange: (groupIds: GroupId[]) => void;
  managerGroupIds?: GroupId[];
  onToggleManager?: (groupId: GroupId) => void;
  isCurrentUser?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  // Ordered labeled sections (a group counts toward the first section listing it);
  // unclaimed groups fall under a trailing "Other groups" section.
  sections?: GroupSection[];
}

export const GroupsMultiSelect = ({
  groups,
  value,
  onChange,
  managerGroupIds,
  onToggleManager,
  isCurrentUser = false,
  placeholder,
  "aria-label": ariaLabel = t`Groups`,
  sections,
}: GroupsMultiSelectProps) => {
  const combobox = useCombobox();
  const [search, setSearch] = useState("");

  const groupsById = new Map(groups.map((group) => [group.id, group]));

  // All Users (or the tenant default) can't be removed, and admins can't leave Administrators.
  const isGroupLocked = (group: GroupInfo) =>
    !canEditMembership(group) || (isAdminGroup(group) && isCurrentUser);

  const adminGroup = groups.find(isAdminGroup);
  const isUserAdmin = adminGroup ? value.includes(adminGroup.id) : false;

  const isManager = (groupId: GroupId) =>
    managerGroupIds?.includes(groupId) ?? false;

  // The member/manager toggle applies only to regular groups a non-admin user belongs to.
  const canEditManager = (group: GroupInfo) =>
    value.includes(group.id) &&
    !isUserAdmin &&
    !isGroupLocked(group) &&
    !isAdminGroup(group) &&
    !PLUGIN_TENANTS.isTenantGroup(group);

  // Built-in "magic" groups sit above custom groups, matching the People table picker.
  const isPinnedGroup = (group: GroupInfo) =>
    isDefaultGroup(group) ||
    isAdminGroup(group) ||
    isDataAnalystGroup(group) ||
    PLUGIN_TENANTS.isExternalUsersGroup(group);

  const selectedGroups = value
    .map((id) => groupsById.get(id))
    .filter(isNotNull)
    .sort(
      (a, b) =>
        Number(isGroupLocked(b)) - Number(isGroupLocked(a)) ||
        getGroupSortOrder(a) - getGroupSortOrder(b),
    );

  const searchTerm = search.trim().toLowerCase();
  const visibleGroups = groups
    .filter((group) =>
      getGroupNameLocalized(group).toLowerCase().includes(searchTerm),
    )
    // Pinned groups lead so the divider sits at the single pinned-to-custom boundary;
    // getGroupSortOrder alone leaves the external default (rank 3) among custom groups.
    .sort(
      (a, b) =>
        Number(isPinnedGroup(b)) - Number(isPinnedGroup(a)) ||
        getGroupSortOrder(a) - getGroupSortOrder(b),
    );

  const toggleGroup = (groupId: GroupId) =>
    onChange(
      value.includes(groupId)
        ? value.filter((id) => id !== groupId)
        : [...value, groupId],
    );

  const handleOptionSubmit = (groupIdString: string) => {
    const group = groupsById.get(Number(groupIdString));
    if (group && !isGroupLocked(group)) {
      toggleGroup(group.id);
      setSearch("");
    }
  };

  const handleRemove = (group: GroupInfo) => {
    if (!isGroupLocked(group)) {
      onChange(value.filter((id) => id !== group.id));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && search === "") {
      const removable = selectedGroups.filter((group) => !isGroupLocked(group));
      const last = removable[removable.length - 1];
      if (last) {
        event.preventDefault();
        handleRemove(last);
      }
    }
  };

  const renderOption = (group: GroupInfo) => (
    <GroupOption
      key={group.id}
      group={group}
      isSelected={value.includes(group.id)}
      isLocked={isGroupLocked(group)}
      showManagerToggle={canEditManager(group)}
      isManager={isManager(group.id)}
      onToggleManager={() => onToggleManager?.(group.id)}
    />
  );

  const renderOptions = () => {
    if (visibleGroups.length === 0) {
      return <Combobox.Empty>{t`No groups found`}</Combobox.Empty>;
    }

    if (sections && sections.length > 0) {
      // A group renders in the first section listing it.
      const sectionIndexByGroupId = new Map<GroupId, number>();
      sections.forEach(({ groupIds }, index) =>
        groupIds.forEach((id) => {
          if (!sectionIndexByGroupId.has(id)) {
            sectionIndexByGroupId.set(id, index);
          }
        }),
      );

      const sectionedGroups: { label: string; members: GroupInfo[] }[] =
        sections.map(({ label }) => ({ label, members: [] }));

      const otherGroups: GroupInfo[] = [];

      visibleGroups.forEach((group) => {
        const sectionIndex = sectionIndexByGroupId.get(group.id);
        if (sectionIndex != null) {
          sectionedGroups[sectionIndex].members.push(group);
        } else {
          otherGroups.push(group);
        }
      });
      return (
        <>
          {sectionedGroups.map(
            ({ label, members }) =>
              members.length > 0 && (
                <Combobox.Group
                  key={label}
                  label={label}
                  role="group"
                  aria-label={label}
                >
                  {members.map(renderOption)}
                </Combobox.Group>
              ),
          )}
          {otherGroups.length > 0 && (
            <Combobox.Group
              label={t`Other groups`}
              role="group"
              aria-label={t`Other groups`}
            >
              {otherGroups.map(renderOption)}
            </Combobox.Group>
          )}
        </>
      );
    }

    // Without sections: unlabeled groups with a divider at the pinned-to-custom boundary.
    const pinnedGroups = visibleGroups.filter(isPinnedGroup);
    const customGroups = visibleGroups.filter((group) => !isPinnedGroup(group));
    return (
      <>
        {pinnedGroups.length > 0 && (
          <Combobox.Group>{pinnedGroups.map(renderOption)}</Combobox.Group>
        )}
        {pinnedGroups.length > 0 && customGroups.length > 0 && (
          <Divider my="sm" />
        )}
        {customGroups.length > 0 && (
          <Combobox.Group>{customGroups.map(renderOption)}</Combobox.Group>
        )}
      </>
    );
  };

  return (
    <Combobox
      store={combobox}
      floatingStrategy="fixed"
      classNames={{ groupLabel: S.groupLabel }}
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.DropdownTarget>
        <PillsInput
          onClick={() => combobox.openDropdown()}
          rightSectionPointerEvents="none"
          rightSection={<Combobox.Chevron />}
        >
          <Pill.Group role="list">
            {selectedGroups.map((group) => (
              <Pill
                key={group.id}
                className={S.pill}
                bg="background_page-primary"
                c="text-primary"
                fw="normal"
                withRemoveButton={!isGroupLocked(group)}
                removeButtonProps={{
                  "aria-label": t`Remove ${getGroupNameLocalized(group)}`,
                  "aria-hidden": false,
                  className: S.remove,
                }}
                onRemove={() => handleRemove(group)}
              >
                {getGroupNameLocalized(group)}
                {isManager(group.id) && ` ${t`(Manager)`}`}
              </Pill>
            ))}
            <Combobox.EventsTarget>
              <PillsInput.Field
                aria-label={ariaLabel}
                role="combobox"
                value={search}
                placeholder={value.length === 0 ? placeholder : undefined}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                  combobox.openDropdown();
                  combobox.updateSelectedOptionIndex();
                }}
                onFocus={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
                onKeyDown={handleKeyDown}
              />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown>
        <Combobox.Options>{renderOptions()}</Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};

interface GroupOptionProps {
  group: GroupInfo;
  isSelected: boolean;
  isLocked: boolean;
  showManagerToggle: boolean;
  isManager: boolean;
  onToggleManager: () => void;
}

const GroupOption = ({
  group,
  isSelected,
  isLocked,
  showManagerToggle,
  isManager,
  onToggleManager,
}: GroupOptionProps) => (
  <Combobox.Option
    value={String(group.id)}
    aria-label={getGroupNameLocalized(group)}
    active={isSelected}
    disabled={isLocked}
  >
    <Flex align="center" justify="space-between" gap="sm">
      <Flex align="center" gap="sm">
        <Checkbox
          className={S.checkbox}
          checked={isSelected}
          readOnly
          aria-hidden
          tabIndex={-1}
        />
        <span>{getGroupNameLocalized(group)}</span>
      </Flex>
      {showManagerToggle && (
        <Box onMouseDown={(event) => event.preventDefault()}>
          <PLUGIN_GROUP_MANAGERS.UserTypeToggle
            isManager={isManager}
            onChange={onToggleManager}
          />
        </Box>
      )}
    </Flex>
  </Combobox.Option>
);
