import debounce from "lodash.debounce";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";

import { TextInput } from "metabase/ui";

interface ChartSettingInputProps {
  "aria-label"?: string;
  value: string | undefined;
  placeholder: string;
  onChange: (value: string) => void;
  id?: string;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
}

export const ChartSettingInput = ({
  "aria-label": ariaLabel,
  value,
  onChange,
  placeholder,
  id,
  leftSection,
  rightSection,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState(value ?? "");

  useEffect(() => {
    setInputValue(value ?? "");
  }, [value]);

  const onChangeRef = useLatest(onChange);
  const onChangeDebounced = useMemo(
    () => debounce((value: string) => onChangeRef.current(value), 400),
    [onChangeRef],
  );

  return (
    <TextInput
      id={id}
      data-testid={id}
      aria-label={ariaLabel}
      placeholder={placeholder}
      leftSection={leftSection}
      leftSectionPointerEvents={leftSection == null ? undefined : "all"}
      rightSection={rightSection}
      rightSectionPointerEvents={rightSection == null ? undefined : "all"}
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value);
        onChangeDebounced(e.target.value);
      }}
      onBlur={() => {
        if (inputValue != null && inputValue !== (value || "")) {
          onChangeDebounced.cancel();
          onChangeRef.current(inputValue);
        }
      }}
    />
  );
};
