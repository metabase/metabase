import cx from "classnames";
import { memo, useState } from "react";

import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Popover, Switch, Text, Tooltip } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { DataPermissionValue, IconName } from "metabase-types/api";

import type { PermissionAction, PermissionSectionConfig } from "../../types";

import S from "./PermissionsSelect.module.css";
import { PermissionsSelectOption } from "./PermissionsSelectOption";

interface PermissionSelectProps extends PermissionSectionConfig {
  onChange: (value: DataPermissionValue, toggleState: boolean | null) => void;
  onAction?: (action: PermissionAction) => void;
}

// we shouldn't ever show this, but rather than throw an error, let the user pick an option to recover
const defaultOption = {
  label: "Missing",
  // Unjustified type cast. FIXME
  value: "missing" as DataPermissionValue,
  // Unjustified type cast. FIXME
  icon: "empty" as IconName,
  // Unjustified type cast. FIXME
  iconColor: "text-disabled" as ColorName,
};

export const PermissionsSelect = memo(function PermissionsSelect({
  options,
  actions,
  value,
  toggleLabel,
  hasChildren,
  toggleDisabled,
  toggleDefaultValue,
  onChange,
  onAction,
  isDisabled,
  disabledTooltip,
  warning,
  isHighlighted,
}: PermissionSelectProps) {
  const [toggleState, setToggleState] = useState(toggleDefaultValue ?? null);
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

  // Admin cells can't change, but they open a read-only popover that says why
  // and shows the options they can't take, instead of a hover tooltip.
  const isAdminLocked = Boolean(isDisabled && isHighlighted);
  const isClickable = !isDisabled || isAdminLocked;

  const triggerContent = (
    <Flex
      className={isClickable ? CS.cursorPointer : CS.cursorDefault}
      align="center"
      miw="11.25rem"
      aria-haspopup="listbox"
      data-testid="permissions-select"
      aria-disabled={!isClickable}
      onClick={isClickable ? () => setOpened((o) => !o) : undefined}
    >
      {isClickable ? (
        <PermissionsSelectOption
          {...selectedOption}
          className={S.selectedOption}
        />
      ) : (
        <PermissionsSelectOption
          {...selectedOption}
          c="text-disabled"
          hint={disabledTooltip}
          iconColor="text-disabled"
        />
      )}

      {warning && (
        <Tooltip label={warning}>
          <Icon name="warning" size={18} mr="xxs" c="text-disabled" />
        </Tooltip>
      )}
    </Flex>
  );

  if (!opened) {
    return triggerContent;
  }

  if (isAdminLocked) {
    return (
      <Popover opened onChange={setOpened}>
        <Popover.Target>{triggerContent}</Popover.Target>
        <Popover.Dropdown>
          <Box maw="18rem" miw="13.125rem" py="sm">
            {disabledTooltip && (
              <Text px="lg" py="sm" c="text-secondary" lh={1.4}>
                {disabledTooltip}
              </Text>
            )}
            <Box component="ul" px={0} role="listbox">
              {options
                .filter((option) => option !== selectedOption)
                .map((option) => (
                  <Box
                    component="li"
                    className={CS.cursorDefault}
                    py="sm"
                    px="lg"
                    role="option"
                    aria-disabled
                    key={option.value}
                  >
                    <PermissionsSelectOption
                      {...option}
                      c="text-disabled"
                      iconColor="text-disabled"
                    />
                  </Box>
                ))}
            </Box>
          </Box>
        </Popover.Dropdown>
      </Popover>
    );
  }

  return (
    <Popover opened onChange={setOpened}>
      <Popover.Target>{triggerContent}</Popover.Target>
      <Popover.Dropdown>
        <Box component="ul" miw="13.125rem" py="sm" px={0} role="listbox">
          {selectableOptions.map((option) => (
            <Box
              component="li"
              className={cx(S.option, CS.cursorPointer)}
              py="sm"
              px="lg"
              role="option"
              key={option.value}
              onClick={() => {
                setOpened(false);
                onChange(option.value, toggleLabel ? toggleState : null);
              }}
            >
              <PermissionsSelectOption {...option} />
            </Box>
          ))}
        </Box>
        {hasActions && (
          <Box
            component="ul"
            className={S.actionsList}
            miw="13.125rem"
            py="sm"
            px={0}
          >
            {actionsForCurrentValue.map((action, index) => (
              <Box
                component="li"
                className={cx(S.option, CS.cursorPointer)}
                py="sm"
                px="lg"
                key={index}
                role="option"
                onClick={() => {
                  setOpened(false);
                  onAction?.(action);
                }}
              >
                <PermissionsSelectOption {...action} />
              </Box>
            ))}
          </Box>
        )}

        {hasChildren && (
          <Flex
            align="center"
            justify="flex-end"
            bg="background_page-tertiary"
            py="sm"
            px="lg"
          >
            <Box component="label" fz="sm" mr="lg">
              {toggleLabel}
            </Box>
            <Switch
              checked={toggleState || false}
              onChange={(e) => onToggleChange(e.currentTarget.checked)}
              disabled={toggleDisabled ?? false}
            />
          </Flex>
        )}
      </Popover.Dropdown>
    </Popover>
  );
});
