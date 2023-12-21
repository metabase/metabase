import { useCallback, useState } from "react";
import { Icon } from "metabase/core/components/Icon";
import { Button, Menu, Stack, Text } from "metabase/ui";
import { isEmpty } from "metabase/lib/validate";
import type { SmartScalarComparison } from "metabase-types/api";
import { COMPARISON_TYPES } from "../constants";
import type { ComparisonMenuOption } from "../types";
import { PeriodsAgoMenuOption } from "./PeriodsAgoOptionComponent";
import { MenuItemStyled } from "./MenuItem.styled";

type SmartScalarComparisonWidgetProps = {
  onChange: (setting: SmartScalarComparison) => void;
  options: ComparisonMenuOption[];
  value: SmartScalarComparison;
};

export function SmartScalarComparisonWidget({
  onChange: onChange,
  options,
  value: selectedValue,
}: SmartScalarComparisonWidgetProps) {
  const [open, setOpen] = useState(false);
  const [editedValue, setEditedValue] = useState(selectedValue);

  const handleEditedValueChange: HandleEditedValueChangeType = useCallback(
    (value: SmartScalarComparison, shouldSubmit: boolean = false) => {
      setEditedValue(value);

      if (shouldSubmit) {
        onChange(value);
        setOpen(false);
      }
    },
    [onChange, setEditedValue, setOpen],
  );

  const selectedOption = options.find(
    ({ type }) => type === selectedValue.type,
  );

  const selectedDisplayName =
    selectedValue.type === COMPARISON_TYPES.PERIODS_AGO
      ? `${selectedValue.value ?? ""} ${selectedOption?.name}`
      : selectedOption?.name;

  const isDisabled = options.length === 1 && !isEmpty(selectedOption);

  return (
    <Menu
      opened={open}
      onChange={setOpen}
      onClose={() => {
        onChange(editedValue);
      }}
      position="bottom-start"
      shadow="sm"
      closeOnItemClick={false}
    >
      <Menu.Target>
        <Button
          data-testid={"comparisons-widget-button"}
          styles={{ inner: { justifyContent: "space-between" } }}
          rightIcon={<Icon name="chevrondown" size="12" />}
          px="1rem"
          fullWidth
          disabled={isDisabled}
        >
          {selectedDisplayName}
        </Button>
      </Menu.Target>

      <Menu.Dropdown miw="18.25rem">
        <Stack spacing="sm">
          {options.map(optionArgs =>
            renderMenuOption({
              editedValue,
              optionArgs,
              handleChange: handleEditedValueChange,
              selectedValue,
            }),
          )}
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}

export type HandleEditedValueChangeType = (
  value: SmartScalarComparison,
  shouldSubmit?: boolean,
) => void;

type RenderMenuOptionProps = {
  editedValue: SmartScalarComparison;
  handleChange: HandleEditedValueChangeType;
  optionArgs: ComparisonMenuOption;
  selectedValue: SmartScalarComparison;
};

function renderMenuOption({
  editedValue,
  handleChange,
  optionArgs,
  selectedValue,
}: RenderMenuOptionProps) {
  const { type, name } = optionArgs;

  if (type === COMPARISON_TYPES.PERIODS_AGO) {
    const { maxValue } = optionArgs;

    return (
      <PeriodsAgoMenuOption
        key={type}
        aria-selected={selectedValue.type === type}
        type={type}
        name={name}
        handleChange={handleChange}
        maxValue={maxValue}
        editedValue={editedValue.type === type ? editedValue : undefined}
      />
    );
  }

  const handleSimpleMenuItemClick = () => {
    handleChange({ type }, true);
  };

  return (
    <MenuItemStyled
      key={type}
      aria-selected={selectedValue.type === type}
      onClick={handleSimpleMenuItemClick}
    >
      <Text fw="bold" ml="0.5rem">
        {name}
      </Text>
    </MenuItemStyled>
  );
}
