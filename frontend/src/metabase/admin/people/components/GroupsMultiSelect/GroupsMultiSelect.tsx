import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import {
  canEditMembership,
  getGroupNameLocalized,
  getGroupSortOrder,
  isAdminGroup,
} from "metabase/admin/utils/groups";
import {
  Checkbox,
  Combobox,
  Flex,
  Pill,
  PillsInput,
  useCombobox,
} from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { GroupId, GroupInfo } from "metabase-types/api";

import S from "./GroupsMultiSelect.module.css";

interface GroupsMultiSelectProps {
  groups: GroupInfo[];
  value: GroupId[];
  onChange: (groupIds: GroupId[]) => void;
  isCurrentUser?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}

export const GroupsMultiSelect = ({
  groups,
  value,
  onChange,
  isCurrentUser = false,
  placeholder,
  "aria-label": ariaLabel = t`Groups`,
}: GroupsMultiSelectProps) => {
  const combobox = useCombobox();
  const [search, setSearch] = useState("");

  const groupsById = new Map(groups.map((group) => [group.id, group]));

  // All Users (or the tenant default) can't be removed, and admins can't leave Administrators.
  const isGroupLocked = (group: GroupInfo) =>
    !canEditMembership(group) || (isAdminGroup(group) && isCurrentUser);

  const selectedGroups = value
    .map((id) => groupsById.get(id))
    .filter(isNotNull)
    .sort(
      (a, b) =>
        Number(isGroupLocked(b)) - Number(isGroupLocked(a)) ||
        getGroupSortOrder(a) - getGroupSortOrder(b),
    );

  const visibleGroups = groups
    .filter((group) =>
      getGroupNameLocalized(group)
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => getGroupSortOrder(a) - getGroupSortOrder(b));

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
    if (event.key === "Backspace" && search.trim() === "") {
      const removable = selectedGroups.filter((group) => !isGroupLocked(group));
      const last = removable[removable.length - 1];
      if (last) {
        event.preventDefault();
        handleRemove(last);
      }
    }
  };

  return (
    <Combobox
      store={combobox}
      floatingStrategy="fixed"
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.DropdownTarget>
        <PillsInput
          onClick={() => combobox.openDropdown()}
          rightSection={
            <Combobox.Chevron
              className={S.chevron}
              data-expanded={combobox.dropdownOpened || undefined}
            />
          }
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
                  "aria-label": t`Remove`,
                  "aria-hidden": false,
                  className: S.remove,
                }}
                onRemove={() => handleRemove(group)}
              >
                {getGroupNameLocalized(group)}
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
        <Combobox.Options>
          {visibleGroups.length === 0 ? (
            <Combobox.Empty>{t`No groups found`}</Combobox.Empty>
          ) : (
            visibleGroups.map((group) => {
              const isSelected = value.includes(group.id);
              return (
                <Combobox.Option
                  key={group.id}
                  value={String(group.id)}
                  aria-label={getGroupNameLocalized(group)}
                  active={isSelected}
                  disabled={isGroupLocked(group)}
                >
                  <Flex align="center" gap="sm">
                    <Checkbox
                      checked={isSelected}
                      readOnly
                      aria-hidden
                      tabIndex={-1}
                      style={{ pointerEvents: "none" }}
                    />
                    <span>{getGroupNameLocalized(group)}</span>
                  </Flex>
                </Combobox.Option>
              );
            })
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};
