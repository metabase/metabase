import debounce from "lodash.debounce";
import { useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";

import { Textarea } from "metabase/ui";

interface ChartSettingTextareaProps {
  value: string | undefined;
  placeholder?: string;
  onChange: (value: string) => void;
  id?: string;
  rows?: number;
}

export const ChartSettingTextarea = ({
  value,
  onChange,
  placeholder,
  id,
  rows = 8,
}: ChartSettingTextareaProps) => {
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  const onChangeRef = useLatest(onChange);
  const onChangeDebounced = useMemo(
    () => debounce((val: string) => onChangeRef.current(val), 400),
    [onChangeRef],
  );

  return (
    <Textarea
      id={id}
      data-testid={id}
      placeholder={placeholder}
      value={localValue}
      rows={rows}
  styles={{ input: { fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" } }}
      onChange={e => {
        setLocalValue(e.target.value);
        onChangeDebounced(e.target.value);
      }}
    />
  );
};
