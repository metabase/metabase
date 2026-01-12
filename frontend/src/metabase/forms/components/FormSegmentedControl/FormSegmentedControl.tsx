import { useField } from "formik";
import type { FocusEvent, ReactNode } from "react";
import { useCallback } from "react";

import {
  Input,
  SegmentedControl,
  type SegmentedControlProps,
} from "metabase/ui";

export interface FormSegmentedControlProps<T extends string>
  extends Omit<SegmentedControlProps<T>, "value"> {
  name: string;
  label?: ReactNode;
  description?: ReactNode;
}

export function FormSegmentedControl<T extends string>({
  label,
  description,
  name,
  onChange,
  onBlur,
  ...props
}: FormSegmentedControlProps<T>) {
  const [{ value }, { error }, { setValue, setTouched }] = useField(name);

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
    <Input.Wrapper label={label} description={description} error={error}>
      <div>
        <SegmentedControl
          {...props}
          name={name}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </div>
    </Input.Wrapper>
  );
}
