import debounce from "lodash.debounce";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import { NumberInput } from "metabase/ui";
import type { ChartSettingWidgetProps } from "metabase/viz-core";

const COMMIT_DELAY_MS = 400;

interface ChartSettingNumberInputProps extends Omit<
  ChartSettingWidgetProps<number>,
  "onChangeSettings"
> {
  id?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * Integer stepper for a numeric setting. Typing and stepper clicks are saved
 * once the input settles or loses focus, so each edit produces a single
 * `onChange`. Clearing the input saves `undefined` to restore the default.
 */
export const ChartSettingNumberInput = ({
  value,
  onChange,
  id,
  placeholder,
  min = -Infinity,
  max = Infinity,
  disabled,
}: ChartSettingNumberInputProps) => {
  const [inputValue, setInputValue] = useState<number | string>(value ?? "");
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setInputValue(value ?? "");
    }
  }, [value]);

  const commitRef = useLatest((rawValue: number | string) => {
    const nextValue = rawValue === "" ? undefined : Number(rawValue);
    if (nextValue !== value) {
      onChange(nextValue);
    }
  });
  const commitDebounced = useMemo(
    () =>
      debounce(
        (rawValue: number | string) => commitRef.current(rawValue),
        COMMIT_DELAY_MS,
      ),
    [commitRef],
  );

  useEffect(() => () => commitDebounced.cancel(), [commitDebounced]);

  const handleChange = (rawValue: number | string) => {
    setInputValue(rawValue);
    commitDebounced(rawValue);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    // Mantine clamps to min/max on blur via onChange before calling onBlur,
    // so flushing here saves the clamped value.
    commitDebounced.flush();
  };

  return (
    <NumberInput
      id={id}
      value={inputValue}
      onChange={handleChange}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onBlur={handleBlur}
      placeholder={placeholder}
      min={min}
      max={max}
      allowDecimal={false}
      allowNegative={min < 0}
      hideControls={false}
      disabled={disabled}
    />
  );
};
