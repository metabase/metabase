import { useCallback, useMemo, useRef, useState } from "react";
import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  SetStateAction,
} from "react";
import { Group, Text, Box } from "metabase/ui";
import type { SmartScalarComparisonPeriodsAgo } from "metabase-types/api";
import { NumberInputStyled } from "./PeriodsAgoOptionComponent.styled";
import { MenuItemStyled } from "./MenuItem.styled";

type PeriodsAgoMenuOptionProps = {
  "aria-selected": boolean;
  maxValue: number;
  name: string;
  onChange: (setting: { type: string; value?: number }) => void;
  selectedValue?: SmartScalarComparisonPeriodsAgo;
  setOpen: Dispatch<SetStateAction<boolean>>;
  type: string;
};

export function PeriodsAgoMenuOption({
  "aria-selected": isSelected,
  maxValue,
  name,
  onChange,
  selectedValue,
  setOpen,
  type,
}: PeriodsAgoMenuOptionProps) {
  const minValue = 2;
  const value = useMemo(() => {
    if (!selectedValue) {
      return null;
    }

    if (Number.isInteger(selectedValue.value)) {
      return selectedValue.value;
    }

    return null;
  }, [selectedValue]);
  const [inputValue, setInputValue] = useState(value ?? minValue);

  const inputRef = useRef<HTMLInputElement>(null);

  const isValidInput = useCallback(() => {
    if (inputValue < minValue) {
      setInputValue(minValue);
      return false;
    }

    if (inputValue > maxValue) {
      setInputValue(maxValue);
      return false;
    }

    if (!Number.isInteger(inputValue)) {
      setInputValue(value ?? minValue);
      return false;
    }

    return true;
  }, [inputValue, maxValue, value]);

  const submitValue = useCallback(() => {
    if (!isValidInput()) {
      return;
    }

    onChange({
      type,
      value: inputValue,
    });

    setOpen(false);
  }, [inputValue, isValidInput, type, onChange, setOpen]);

  const handleInputEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();

      if (!isValidInput()) {
        // re-select input if the number was not a valid input
        return setTimeout(() => {
          inputRef.current?.select();
        }, 0);
      }

      submitValue();
    }
  };

  const handleInputClick = (e: MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    inputRef.current?.select();
  };

  return (
    <MenuItemStyled py="0.25rem" aria-selected={isSelected}>
      <Box onClick={() => submitValue()}>
        <Group position="apart" px="0.5rem">
          <Text fw="bold">{`${inputValue} ${name}`}</Text>
          <NumberInputStyled
            ref={inputRef}
            value={inputValue}
            onChange={(value: number) => setInputValue(value)}
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
