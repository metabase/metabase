import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Icon } from "metabase/core/components/Icon";
import { Button, Menu, Stack, Text } from "metabase/ui";
import { isEmpty } from "metabase/lib/validate";
import type { SmartScalarComparison } from "metabase-types/api";
import { COMPARISON_TYPES } from "../constants";
import type { ComparisonMenuOption } from "../types";
import { PeriodsAgoMenuOption } from "./PeriodsAgoOptionComponent";
import { MenuItemStyled } from "./MenuItem.styled";

type SmartScalarComparisonWidgetProps = {
  onChange: (setting: { type: string; value?: number }) => void;
  options: ComparisonMenuOption[];
  value: SmartScalarComparison;
};

export function SmartScalarComparisonWidget({
  onChange,
  options,
  value: selectedValue,
}: SmartScalarComparisonWidgetProps) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find(
    ({ type }) => type === selectedValue.type,
  );

  const selectedDisplayName =
    selectedValue.type === COMPARISON_TYPES.PERIODS_AGO
      ? `${selectedValue.value ?? ""} ${selectedOption?.name}`
      : selectedOption?.name;

  const isDisabled = options.length === 1 && !isEmpty(selectedOption);

  return (
    <Menu opened={open} onChange={setOpen} position="bottom-start" shadow="sm">
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
            renderMenuOption({ onChange, setOpen, optionArgs, selectedValue }),
          )}
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}

type RenderMenuOptionProps = {
  onChange: (setting: { type: string; value?: number }) => void;
  optionArgs: ComparisonMenuOption;
  selectedValue: SmartScalarComparison;
  setOpen: Dispatch<SetStateAction<boolean>>;
};

function renderMenuOption({
  onChange,
  optionArgs,
  setOpen,
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
        onChange={onChange}
        setOpen={setOpen}
        maxValue={maxValue}
        selectedValue={selectedValue.type === type ? selectedValue : undefined}
      />
    );
  }

  return (
    <MenuItemStyled
      key={type}
      aria-selected={selectedValue.type === type}
      onClick={() => onChange({ type })}
    >
      <Text fw="bold" ml="0.5rem">
        {name}
      </Text>
    </MenuItemStyled>
  );
}
