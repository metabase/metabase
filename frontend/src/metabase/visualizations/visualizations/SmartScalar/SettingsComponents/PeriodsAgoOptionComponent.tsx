import { useCallback, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Group, Text, Box } from "metabase/ui";
import type { SmartScalarComparisonPeriodsAgo } from "metabase-types/api";
import type { COMPARISON_TYPES } from "metabase/visualizations/visualizations/SmartScalar/constants";
import { NumberInputStyled } from "./PeriodsAgoOptionComponent.styled";
import { MenuItemStyled } from "./MenuItem.styled";
import type { HandleEditedValueChangeType } from "./SmartScalarSettingsWidgets";

type PeriodsAgoMenuOptionProps = {
  "aria-selected": boolean;
  editedValue?: SmartScalarComparisonPeriodsAgo;
  maxValue: number;
  name: string;
  handleChange: HandleEditedValueChangeType;
  type: typeof COMPARISON_TYPES.PERIODS_AGO;
};

const MIN_VALUE = 2;

export function PeriodsAgoMenuOption({
  "aria-selected": isSelected,
  editedValue,
  maxValue,
  name,
  handleChange,
  type,
}: PeriodsAgoMenuOptionProps) {
  // utilities for blurring and selecting the input whenever
  // validation fails so that the user can easily re-enter a valid value
  const inputRef = useRef<HTMLInputElement>(null);
  const selectInput = useCallback(() => {
    inputRef.current?.select();
  }, [inputRef]);
  const reSelectInput = useCallback(() => {
    inputRef.current?.blur();
    setTimeout(() => selectInput(), 0);
  }, [selectInput]);

  const value = editedValue?.value ?? MIN_VALUE;
  const validateInput = useCallback(
    (value: number) => {
      if (value < 1) {
        handleChange({ type, value: MIN_VALUE });
        reSelectInput();
        return;
      }

      if (value > maxValue) {
        handleChange({ type, value: maxValue });
        reSelectInput();
        return;
      }

      if (!Number.isInteger(value)) {
        handleChange({ type, value: Math.floor(value) ?? MIN_VALUE });
        reSelectInput();
        return;
      }

      handleChange({ type, value });
    },
    [handleChange, maxValue, reSelectInput, type],
  );

  const handleInputEnter = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleChange({ type, value }, true);
      }
    },
    [handleChange, type, value],
  );
  const handleInputClick = useCallback(
    (e: MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      selectInput();
    },
    [selectInput],
  );

  return (
    <MenuItemStyled py="0.25rem" aria-selected={isSelected}>
      <Box onClick={() => handleChange({ type, value }, true)}>
        <Group position="apart" px="0.5rem">
          <Text fw="bold">{`${value} ${name}`}</Text>
          <NumberInputStyled
            ref={inputRef}
            value={value}
            onChange={(value: number) => validateInput(value)}
            onKeyPress={handleInputEnter}
            onClick={handleInputClick}
            size="xs"
            w="3.5rem"
            type="number"
            required
          ></NumberInputStyled>
        </Group>
      </Box>
    </MenuItemStyled>
  );
}
