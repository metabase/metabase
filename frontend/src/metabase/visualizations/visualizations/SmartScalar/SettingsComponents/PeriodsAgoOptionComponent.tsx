import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Group, Text, Box } from "metabase/ui";
import type { SelectedComparisonPeriodsAgo } from "metabase-types/api";
import { NumberInputStyled } from "./PeriodsAgoOptionComponent.styled";
import { MenuItemStyled } from "./MenuItem.styled";

type PeriodsAgoOptionComponentProps = {
  isSelected: boolean;
  maxValue: number;
  name: string;
  onChange: (setting: { type: string; value?: number }) => void;
  selectedValue?: SelectedComparisonPeriodsAgo;
  setOpen: (value: boolean) => void;
  type: string;
};

export function PeriodsAgoOptionComponent({
  isSelected,
  maxValue,
  name,
  onChange,
  selectedValue,
  setOpen,
  type,
}: PeriodsAgoOptionComponentProps) {
  const value = useMemo(() => {
    if (!selectedValue) {
      return null;
    }

    if (Number.isInteger(selectedValue.value)) {
      return selectedValue.value;
    }

    return null;
  }, [selectedValue]);
  const minValue = 2;

  const [inputValue, setInputValue] = useState(value ?? minValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // used to prevent accidental button click when mouseDown inside input field
  // but dragged to highlight all text and accidentally mouseUp on the button
  // outside the input field
  const mouseDownInChildRef = useRef(false);
  const handleChildMouseDownAndUp = useCallback(
    (e: MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      e.preventDefault();
      inputRef.current?.select();

      mouseDownInChildRef.current = true;
    },
    [],
  );
  const handleParentMouseDown = useCallback(() => {
    mouseDownInChildRef.current = false;
  }, []);

  const submitValue = useCallback(() => {
    if (inputValue < minValue) {
      return setInputValue(minValue);
    }

    if (inputValue > maxValue) {
      return setInputValue(maxValue);
    }

    if (!Number.isInteger(inputValue)) {
      return setInputValue(value ?? minValue);
    }

    onChange({
      type,
      value: inputValue,
    });

    setOpen(false);
  }, [inputValue, maxValue, type, onChange, setOpen, value]);

  const handleButtonClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();

      if (mouseDownInChildRef.current) {
        mouseDownInChildRef.current = false;
        return;
      }

      submitValue();
    },
    [submitValue],
  );

  const handleEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      mouseDownInChildRef.current = false;
      inputRef.current?.blur();

      submitValue();

      // re-select input just in case the input number was not a valid input
      setTimeout(() => {
        inputRef.current?.select();
      }, 0);
    }
  };

  return (
    <MenuItemStyled py="0.25rem" isSelected={isSelected}>
      <Box onClick={handleButtonClick} onMouseDown={handleParentMouseDown}>
        <Group position="apart" px="0.5rem">
          <Text fw="bold">{`${inputValue} ${name}`}</Text>
          <NumberInputStyled
            ref={inputRef}
            value={inputValue}
            onChange={(value: number) => setInputValue(value)}
            onMouseDown={handleChildMouseDownAndUp}
            onMouseUp={handleChildMouseDownAndUp}
            onKeyPress={handleEnter}
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
