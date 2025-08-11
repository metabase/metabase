import debounce from "lodash.debounce";
import { useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";

import { TextInput } from "metabase/ui";

interface ChartSettingInputProps {
  value: string | undefined;
  placeholder: string;
  onChange: (value: string) => void;
  id?: string;
}

export const ChartSettingInput = ({
  value,
  onChange,
  placeholder,
  id,
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
      placeholder={placeholder}
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
