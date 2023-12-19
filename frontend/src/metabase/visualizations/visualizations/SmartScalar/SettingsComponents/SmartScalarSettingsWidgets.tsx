import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Icon } from "metabase/core/components/Icon";
import { Group, Menu, Stack, Text } from "metabase/ui";
import { isEmpty } from "metabase/lib/validate";
import type { SelectedComparison } from "metabase-types/api";
import { COMPARISON_TYPES } from "../constants";
import type { ComparisonMenuOption } from "../types";
import { PeriodsAgoOptionComponent } from "./PeriodsAgoOptionComponent";
import { ButtonStyled } from "./SmartScalarSettingsWidgets.styled";
import { MenuItemStyled } from "./MenuItem.styled";

type SmartScalarComparisonWidgetProps = {
  onChange: (setting: { type: string; value?: number }) => void;
  options: ComparisonMenuOption[];
  value: SelectedComparison;
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
        <ButtonStyled
          data-testid={"comparisons-widget-button"}
          disabled={isDisabled}
        >
          <Group spacing="sm">
            {selectedDisplayName}
            <Icon name="chevrondown" size="14" />
          </Group>
        </ButtonStyled>
      </Menu.Target>

      <Menu.Dropdown miw="18.25rem">
        <Stack spacing="sm">
          {options.map(optionArgs =>
            createMenuOption({ onChange, setOpen, optionArgs, selectedValue }),
          )}
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
}

type CreateMenuOptionProps = {
  onChange: (setting: { type: string; value?: number }) => void;
  optionArgs: ComparisonMenuOption;
  selectedValue: SelectedComparison;
  setOpen: Dispatch<SetStateAction<boolean>>;
};

function createMenuOption({
  onChange,
  optionArgs,
  setOpen,
  selectedValue,
}: CreateMenuOptionProps) {
  const { type, name } = optionArgs;

  if (type === COMPARISON_TYPES.PERIODS_AGO) {
    const { maxValue } = optionArgs;

    return (
      <PeriodsAgoOptionComponent
        key={type}
        isSelected={selectedValue.type === type}
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
      isSelected={selectedValue.type === type}
      onClick={() => onChange({ type })}
    >
      <Text fw="bold" ml="0.5rem">
        {name}
      </Text>
    </MenuItemStyled>
  );
}
