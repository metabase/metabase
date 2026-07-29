import { useField } from "formik";
import type { FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { MultiSelectProps } from "metabase/ui";
import { MultiSelect } from "metabase/ui";

export interface FormMultiSelectProps extends Omit<
  MultiSelectProps,
  "value" | "error"
> {
  name: string;
}

export const FormMultiSelect = forwardRef(function FormMultiSelect(
  { name, onChange, onBlur, ...props }: FormMultiSelectProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (newValue: string[]) => {
      setValue(newValue);
      onChange?.(newValue);
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
    <MultiSelect
      {...props}
      ref={ref}
      name={name}
      value={value ?? []}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
