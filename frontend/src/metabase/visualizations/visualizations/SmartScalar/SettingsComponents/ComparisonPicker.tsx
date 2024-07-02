import type { MouseEvent } from "react";
import { useCallback, useState } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { rem, Menu, Stack, Text } from "metabase/ui";
import type {
  DatasetColumn,
  SmartScalarComparison,
  SmartScalarComparisonType,
} from "metabase-types/api";

import { COMPARISON_TYPES } from "../constants";
import type { ComparisonMenuOption } from "../types";

import { AnotherColumnForm } from "./AnotherColumnForm";
import { MenuItemStyled } from "./MenuItem.styled";
import { PeriodsAgoMenuOption } from "./PeriodsAgoMenuOption";
import {
  ComparisonPickerButton,
  ComparisonPickerSecondaryText,
  DragHandleIcon,
  ExpandIcon,
  RemoveIcon,
} from "./SmartScalarSettingsWidgets.styled";
import { StaticNumberForm } from "./StaticNumberForm";

type Tab = "anotherColumn" | "staticNumber" | null;

interface ComparisonPickerProps {
  value: SmartScalarComparison;
  options: ComparisonMenuOption[];
  comparableColumns: DatasetColumn[];
  isInitiallyOpen?: boolean;
  isDraggable?: boolean;
  isRemovable?: boolean;
  onChange: (setting: SmartScalarComparison) => void;
  onRemove: () => void;
}

export function ComparisonPicker({
  onChange,
  onRemove,
  options,
  isInitiallyOpen = false,
  isDraggable = false,
  isRemovable = true,
  comparableColumns,
  value: selectedValue,
}: ComparisonPickerProps) {
  const [open, setOpen] = useState(isInitiallyOpen);
  const [tab, setTab] = useState<Tab>(
    getTabForComparisonType(selectedValue.type),
  );
  const [editedValue, setEditedValue] = useState(selectedValue);

  const selectedOption = options.find(({ type }) => type === editedValue.type);

  const isDisabled = options.length === 1;

  const handleRemoveClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onRemove();
    },
    [onRemove],
  );

  const handleEditedValueChange: HandleEditedValueChangeType = useCallback(
    (value: SmartScalarComparison, shouldSubmit = false) => {
      setEditedValue(value);

      if (shouldSubmit) {
        onChange(value);
        setOpen(false);
      }
    },
    [onChange, setEditedValue, setOpen],
  );

  const handleMenuStateChange = (isOpen: boolean) => {
    if (isOpen) {
      setEditedValue(selectedValue);
      setTab(getTabForComparisonType(selectedValue.type));
    } else if (!_.isEqual(selectedValue, editedValue)) {
      onChange(editedValue);
    }
    setOpen(isOpen);
  };

  const renderMenuDropdownContent = () => {
    if (tab === "anotherColumn") {
      return (
        <AnotherColumnForm
          value={
            selectedValue.type === COMPARISON_TYPES.ANOTHER_COLUMN
              ? selectedValue
              : undefined
          }
          columns={comparableColumns}
          onChange={nextValue => {
            handleEditedValueChange(
              { id: selectedValue.id, ...nextValue },
              true,
            );
          }}
          onBack={() => setTab(null)}
        />
      );
    }
    if (tab === "staticNumber") {
      return (
        <StaticNumberForm
          value={
            selectedValue.type === COMPARISON_TYPES.STATIC_NUMBER
              ? selectedValue
              : undefined
          }
          onChange={nextValue => {
            handleEditedValueChange(
              { id: selectedValue.id, ...nextValue },
              true,
            );
          }}
          onBack={() => setTab(null)}
        />
      );
    }
    return (
      <Stack spacing="sm">
        {options.map(optionArgs =>
          renderMenuOption({
            editedValue,
            selectedValue,
            optionArgs,
            onChange: handleEditedValueChange,
            onChangeTab: setTab,
          }),
        )}
      </Stack>
    );
  };

  return (
    <Menu
      opened={open}
      onChange={handleMenuStateChange}
      position="bottom-start"
      shadow="sm"
      closeOnItemClick={false}
    >
      <Menu.Target>
        <ComparisonPickerButton
          disabled={isDisabled}
          leftIcon={isDraggable && <DragHandleIcon name="grabber" />}
          rightIcon={
            isRemovable && (
              <IconButtonWrapper
                aria-label={t`Remove`}
                onClick={handleRemoveClick}
              >
                <RemoveIcon name="close" />
              </IconButtonWrapper>
            )
          }
          px="1rem"
          fullWidth
          data-testid="comparisons-widget-button"
          styles={{
            label: { flex: 1 },
            inner: { justifyContent: "space-between" },
          }}
        >
          <DisplayName value={editedValue} option={selectedOption} />
          <ExpandIcon name="chevrondown" size={14} />
        </ComparisonPickerButton>
      </Menu.Target>

      <Menu.Dropdown miw={rem(344)}>
        {renderMenuDropdownContent()}
      </Menu.Dropdown>
    </Menu>
  );
}

function getTabForComparisonType(type: SmartScalarComparisonType): Tab {
  if (type === COMPARISON_TYPES.ANOTHER_COLUMN) {
    return "anotherColumn";
  }
  if (type === COMPARISON_TYPES.STATIC_NUMBER) {
    return "staticNumber";
  }
  return null;
}

type HandleEditedValueChangeType = (
  value: SmartScalarComparison,
  shouldSubmit?: boolean,
) => void;

type RenderMenuOptionProps = {
  editedValue: SmartScalarComparison;
  selectedValue: SmartScalarComparison;
  optionArgs: ComparisonMenuOption;
  onChange: HandleEditedValueChangeType;
  onChangeTab: (tab: Tab) => void;
};

function renderMenuOption({
  editedValue,
  selectedValue,
  optionArgs,
  onChange,
  onChangeTab,
}: RenderMenuOptionProps) {
  const { type, name } = optionArgs;

  const isSelected = selectedValue.type === type;

  if (type === COMPARISON_TYPES.PERIODS_AGO) {
    const { maxValue } = optionArgs;

    return (
      <PeriodsAgoMenuOption
        key={type}
        aria-selected={isSelected}
        type={type}
        name={name}
        onChange={(nextValue, submit) =>
          onChange({ id: selectedValue.id, ...nextValue }, submit)
        }
        maxValue={maxValue}
        editedValue={editedValue.type === type ? editedValue : undefined}
      />
    );
  }

  const handleClick = () => {
    if (
      type === COMPARISON_TYPES.ANOTHER_COLUMN ||
      type === COMPARISON_TYPES.STATIC_NUMBER
    ) {
      const tab = getTabForComparisonType(type);
      onChangeTab(tab);
    } else {
      onChange({ id: selectedValue.id, type }, true);
    }
  };

  return (
    <MenuItemStyled key={type} aria-selected={isSelected} onClick={handleClick}>
      <Text fw="bold" ml="0.5rem">
        {name}
      </Text>
    </MenuItemStyled>
  );
}

function DisplayName({
  value,
  option,
}: {
  value: SmartScalarComparison;
  option?: ComparisonMenuOption;
}) {
  if (value.type === COMPARISON_TYPES.PERIODS_AGO) {
    return <span>{`${value.value} ${option?.name}`}</span>;
  }

  if (value.type === COMPARISON_TYPES.ANOTHER_COLUMN) {
    const columnName = (
      <ComparisonPickerSecondaryText key="column-name">{`(${value.label})`}</ComparisonPickerSecondaryText>
    );
    return <span>{jt`Column ${columnName}`}</span>;
  }

  if (value.type === COMPARISON_TYPES.STATIC_NUMBER) {
    const label = (
      <ComparisonPickerSecondaryText key="label">{`(${value.label})`}</ComparisonPickerSecondaryText>
    );
    return <span>{jt`Custom value ${label}`}</span>;
  }

  return <span>{option?.name}</span>;
}
