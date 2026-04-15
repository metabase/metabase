import debounce from "lodash.debounce";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";

import { TextInput } from "metabase/ui";

import type { ChartSettingWidgetProps } from "./types";

const ALLOWED_CHARS = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "-",
  "e",
]);

// Note: there are more props than these that are provided by the viz settings
// code, we just don't have types for them here.
interface ChartSettingInputProps
  extends Omit<ChartSettingWidgetProps<number>, "onChangeSettings"> {
  options?: {
    isInteger?: boolean;
    isNonNegative?: boolean;
  };
  id?: string;
  placeholder?: string;
  getDefault?: () => string;
  className?: string;
}

export const ChartSettingInputNumeric = ({
  onChange,
  value,
  placeholder,
  options,
  id,
  getDefault,
  className,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState<string>(value?.toString() ?? "");
  const isFocusedRef = useRef(false);
  const defaultValueProps = getDefault ? { defaultValue: getDefault() } : {};

  const processValueRef = useLatest((rawValue: string) => {
    const rawNum = rawValue !== "" ? Number(rawValue) : Number.NaN;
    let num = rawNum;
    if (options?.isInteger) {
      num = Math.round(num);
    }
    if (options?.isNonNegative && num < 0) {
      num *= -1;
    }

    if (isNaN(num)) {
      onChange(undefined);
    } else {
      onChange(num);
      // When the user is mid-edit with a decimal value (e.g. "0.", "0.00",
      // ".5"), String(num) would collapse their input. Only skip the display
      // update for these cosmetic differences — still normalize when options
      // corrected the value or for scientific notation expansion.
      const isMidEditDecimal =
        isFocusedRef.current &&
        num === rawNum &&
        String(num) !== rawValue &&
        !rawValue.includes("e");
      if (!isMidEditDecimal) {
        setInputValue(String(num));
      }
    }
  });
  const processValueDebounced = useMemo(() => {
    return debounce((rawValue: string) => {
      processValueRef.current(rawValue);
    }, 200);
  }, [processValueRef]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    processValueDebounced.cancel();
    processValueRef.current(inputValue);
  }, [processValueDebounced, processValueRef, inputValue]);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setInputValue(value?.toString() ?? "");
    }
  }, [value]);

  return (
    <TextInput
      id={id}
      {...defaultValueProps}
      placeholder={placeholder}
      type="text"
      error={inputValue && isNaN(Number(inputValue))}
      value={inputValue}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.value.split("").every((ch) => ALLOWED_CHARS.has(ch))) {
          setInputValue(e.target.value);
          processValueDebounced(e.target.value);
        }
      }}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
    />
  );
};
