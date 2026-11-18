import { useState } from "react";
import { t } from "ttag";

import {
  Combobox,
  Group,
  Icon,
  Pill,
  PillsInput,
  useCombobox,
} from "metabase/ui";

const DROPDOWN_WIDTH = 300;

interface GroupOption {
  value: string;
  label: string;

  // Only applicable when tenants are enabled.
  isTenantGroup: boolean;
}

interface AddDataAppsGroupsComboboxProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: GroupOption[];
  disabled?: boolean;
}

/**
 * Combobox for assigning groups to data apps.
 *
 * Differentiates between tenant and internal groups, when
 * tenants are enabled.
 */
export function AddDataAppsGroupsCombobox({
  value,
  onChange,
  options,
  disabled,
}: AddDataAppsGroupsComboboxProps) {
  const [search, setSearch] = useState("");

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const visibleOptions = options.filter(
    (option) =>
      !value.includes(option.value) &&
      option.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const handleAddGroup = (selectedValue: string) => {
    onChange([...value, selectedValue]);
    setSearch("");

    combobox.resetSelectedOption();
  };

  const removeGroup = (id: string) =>
    onChange(value.filter((selectedId) => selectedId !== id));

  return (
    <Combobox
      store={combobox}
      size="md"
      width={DROPDOWN_WIDTH}
      position="bottom-start"
      onOptionSubmit={handleAddGroup}
    >
      <Combobox.DropdownTarget>
        <PillsInput
          size="md"
          disabled={disabled}
          onClick={() => combobox.openDropdown()}
        >
          <Pill.Group role="list" size="md">
            {value.map((id) => {
              const option = options.find((option) => option.value === id);

              return option ? (
                <Pill
                  key={id}
                  role="listitem"
                  aria-label={option.label}
                  withRemoveButton
                  onRemove={() => removeGroup(id)}
                  removeButtonProps={{
                    "aria-label": t`Remove ${option.label}`,
                    "aria-hidden": false,
                  }}
                >
                  <GroupOptionLabel compact {...option} />
                </Pill>
              ) : null;
            })}

            <Combobox.EventsTarget>
              <PillsInput.Field
                aria-label={t`Groups`}
                placeholder={t`Search for groups to add`}
                disabled={disabled}
                value={search}
                data-autofocus
                onChange={(event) => {
                  setSearch(event.currentTarget.value);

                  combobox.openDropdown();
                  combobox.updateSelectedOptionIndex();
                }}
                onFocus={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && search === "") {
                    event.preventDefault();

                    // removes previously added group
                    onChange(value.slice(0, -1));
                  }
                }}
              />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown>
        <Combobox.Options p="sm">
          {visibleOptions.map((option) => (
            <Combobox.Option
              key={option.value}
              value={option.value}
              aria-label={option.label}
              py="sm"
            >
              <GroupOptionLabel {...option} />
            </Combobox.Option>
          ))}

          {visibleOptions.length === 0 && (
            <Combobox.Empty>{t`No groups found`}</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

function GroupOptionLabel({
  label,
  isTenantGroup,
  compact = false,
}: {
  label: string;
  isTenantGroup: boolean;
  compact?: boolean;
}) {
  return (
    <Group gap="xs" wrap="nowrap" component="span">
      <span>{label}</span>

      {isTenantGroup && (
        <Icon
          name="globe"
          aria-label={t`Tenant group`}
          tooltip={t`Tenant group`}
          // use smaller icon size in pills
          size={compact ? 12 : 14}
        />
      )}
    </Group>
  );
}
