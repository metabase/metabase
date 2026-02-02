import { Fragment, memo, useState } from "react";

import { Toggle } from "metabase/common/components/Toggle";
import CS from "metabase/css/core/index.css";
import { Icon, Popover, Tooltip } from "metabase/ui";

import type {
  DataPermissionValue,
  PermissionAction,
  PermissionSectionConfig,
} from "../../types";

import {
  ActionsList,
  DisabledPermissionOption,
  OptionsList,
  OptionsListItem,
  PermissionsSelectRoot,
  SelectedOption,
  ToggleContainer,
  ToggleLabel,
  WarningIcon,
} from "./PermissionsSelect.styled";
import { PermissionsSelectOption } from "./PermissionsSelectOption";

interface PermissionSelectProps extends PermissionSectionConfig {
  onChange: (value: DataPermissionValue, toggleState: boolean | null) => void;
  onAction?: (action: PermissionAction) => void;
}

// we shouldn't ever show this, but rather than throw an error, let the user pick an option to recover
const defaultOption = {
  label: "Missing",
  value: "missing" as DataPermissionValue,
  icon: "empty",
  iconColor: "text-tertiary",
};

export const PermissionsSelect = memo(function PermissionsSelect({
  options,
  actions,
  value,
  toggleLabel,
  hasChildren,
  onChange,
  onAction,
  isDisabled,
  disabledTooltip,
  warning,
  isHighlighted,
}: PermissionSelectProps) {
  const [toggleState, setToggleState] = useState<boolean | null>(null);
  const [opened, setOpened] = useState(false);
  let selectedOption = options.find((option) => option.value === value);
  if (!selectedOption) {
    console.warn(`${value} is not a valid option`);
    selectedOption = { ...defaultOption };
  }
  const selectableOptions = hasChildren
    ? options
    : options.filter((option) => option !== selectedOption);
  const onToggleChange = (checked: boolean) => {
    setToggleState(checked);
    onChange(selectedOption.value, checked);
  };

  const actionsForCurrentValue = actions?.[selectedOption.value] || [];
  const hasActions = actionsForCurrentValue.length > 0;

  return (
    <Popover opened={opened} onChange={setOpened} disabled={isDisabled}>
      <Popover.Target>
        <PermissionsSelectRoot
          isDisabled={isDisabled}
          aria-haspopup="listbox"
          data-testid="permissions-select"
          aria-disabled={isDisabled}
          onClick={isDisabled ? undefined : () => setOpened((o) => !o)}
        >
          {isDisabled ? (
            <DisabledPermissionOption
              {...selectedOption}
              isHighlighted={isHighlighted ?? false}
              hint={disabledTooltip}
              iconColor="text-tertiary"
            />
          ) : (
            <SelectedOption {...selectedOption} />
          )}

          {warning && (
            <Tooltip label={warning}>
              <WarningIcon />
            </Tooltip>
          )}

          <Icon
            style={{ visibility: isDisabled ? "hidden" : "visible" }}
            name="chevrondown"
            size={16}
            c="text-tertiary"
            className={CS.flexNoShrink}
          />
        </PermissionsSelectRoot>
      </Popover.Target>
      <Popover.Dropdown>
        <Fragment>
          <OptionsList role="listbox">
            {selectableOptions.map((option) => (
              <OptionsListItem
                role="option"
                key={option.value}
                onClick={() => {
                  setOpened(false);
                  onChange(option.value, toggleLabel ? toggleState : null);
                }}
              >
                <PermissionsSelectOption {...option} />
              </OptionsListItem>
            ))}
          </OptionsList>
          {hasActions && (
            <ActionsList>
              {actionsForCurrentValue.map((action, index) => (
                <OptionsListItem
                  key={index}
                  role="option"
                  onClick={() => {
                    setOpened(false);
                    onAction?.(action);
                  }}
                >
                  <PermissionsSelectOption {...action} />
                </OptionsListItem>
              ))}
            </ActionsList>
          )}

          {hasChildren && (
            <ToggleContainer>
              <ToggleLabel>{toggleLabel}</ToggleLabel>
              <Toggle
                small
                value={toggleState || false}
                onChange={onToggleChange}
              />
            </ToggleContainer>
          )}
        </Fragment>
      </Popover.Dropdown>
    </Popover>
  );
});
