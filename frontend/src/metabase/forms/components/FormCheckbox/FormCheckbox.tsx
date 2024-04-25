import { useField } from "formik";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { CheckboxProps } from "metabase/ui";
import { Checkbox } from "metabase/ui";

export interface FormCheckboxProps
  extends Omit<CheckboxProps, "value" | "error"> {
  name: string;
}

export const FormCheckbox = forwardRef(function FormCheckbox(
  { name, onChange, onBlur, ...props }: FormCheckboxProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.checked);
      onChange?.(event);
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
    <Checkbox
      {...props}
      ref={ref}
      checked={value ?? false}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
