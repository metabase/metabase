import { useField } from "formik";
import type { FocusEvent } from "react";
import { useCallback } from "react";

import { SegmentedControl, type SegmentedControlProps } from "metabase/ui";

export interface FormSegmentedControlProps<T extends string>
  extends Omit<SegmentedControlProps<T>, "value"> {
  name: string;
}

export function FormSegmentedControl<T extends string>({
  name,
  onChange,
  onBlur,
  ...props
}: FormSegmentedControlProps<T>) {
  const [{ value }, _meta, { setValue, setTouched }] = useField(name);

  const handleChange = useCallback(
    (newValue: T) => {
      setValue(newValue);
      onChange?.(newValue ?? "");
    },
    [setValue, onChange],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
  );

  return (
    <SegmentedControl
      {...props}
      name={name}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
