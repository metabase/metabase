import { useCallback, useMemo, useRef, useState } from "react";
import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  SetStateAction,
} from "react";
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
  setOpen: Dispatch<SetStateAction<boolean>>;
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

  const handleBlur = useCallback(() => {
    if (!isValidInput()) {
      // prevent closing if user needs to re-enter a valid value
      return setOpen(true);
    }

    submitValue();
  }, [isValidInput, setOpen, submitValue]);

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
            onBlur={handleBlur}
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
