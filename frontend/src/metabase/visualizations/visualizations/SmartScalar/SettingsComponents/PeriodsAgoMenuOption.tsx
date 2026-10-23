import type { KeyboardEvent, MouseEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Group, NumberInput, Text, rem } from "metabase/ui";
import type { COMPARISON_TYPES } from "metabase/visualizations/visualizations/SmartScalar/constants";
import type { SmartScalarComparisonPeriodsAgo } from "metabase-types/api";

import { MenuItemStyled } from "./MenuItem.styled";
import S from "./PeriodsAgoMenuOption.module.css";

type PeriodsAgoMenuOptionProps = {
  "aria-selected": boolean;
  editedValue?: SmartScalarComparisonPeriodsAgo;
  maxValue: number;
  name: string;
  type: typeof COMPARISON_TYPES.PERIODS_AGO;
  onChange: (
    value: Omit<SmartScalarComparisonPeriodsAgo, "id">,
    submit?: boolean,
  ) => void;
};

const MIN_VALUE = 2;

export function PeriodsAgoMenuOption({
  "aria-selected": isSelected,
  editedValue,
  maxValue,
  name,
  onChange,
  type,
}: PeriodsAgoMenuOptionProps) {
  const [message, setMessage] = useState<string | null>(null);

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
  const handleInputChange = useCallback(
    (value: number | string) => {
      if (message) {
        setMessage(null);
      }

      if (typeof value === "string" || value < 1) {
        onChange({ type, value: MIN_VALUE });
        reSelectInput();
        return;
      }

      if (value > maxValue) {
        onChange({ type, value: maxValue });
        setMessage(
          t`${value} is beyond the date range. Auto-adjusted to the max.`,
        );
        reSelectInput();
        return;
      }

      onChange({ type, value });
    },
    [maxValue, message, onChange, reSelectInput, type],
  );

  const handleInputEnter = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) {
        return;
      }
      if (e.key === "Enter") {
        onChange({ type, value }, true);
      }
    },
    [onChange, type, value],
  );
  const handleInputClick = useCallback(
    (e: MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      selectInput();
    },
    [selectInput],
  );

  return (
    <MenuItemStyled py="xxs" aria-selected={isSelected}>
      <Box px="sm" onClick={() => onChange({ type, value }, true)}>
        <Group gap="sm">
          <NumberInput
            classNames={{ input: S.input }}
            allowDecimal={false}
            value={value}
            onChange={(value) => handleInputChange(value)}
            onKeyPress={handleInputEnter}
            onClick={handleInputClick}
            size="xs"
            w={rem(56)}
            required
            ref={inputRef}
          />
          <Text fw="bold">{name}</Text>
        </Group>
        {!!message && (
          <Text size="xs" color="text-disabled" mt="xxs">
            {message}
          </Text>
        )}
      </Box>
    </MenuItemStyled>
  );
}
