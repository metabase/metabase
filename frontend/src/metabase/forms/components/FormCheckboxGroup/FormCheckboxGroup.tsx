import { forwardRef, useCallback } from "react";
import type { FocusEvent, Ref } from "react";
import { useField } from "formik";
import { Checkbox } from "metabase/ui";
import type { CheckboxGroupProps } from "metabase/ui";

export interface FormCheckboxGroupProps
  extends Omit<CheckboxGroupProps, "value" | "error"> {
  name: string;
}

export const FormCheckboxGroup = forwardRef(function FormCheckboxGroup(
  { name, onChange, onBlur, children, ...props }: FormCheckboxGroupProps,
  ref: Ref<HTMLDivElement>,
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
    <Checkbox.Group
      {...props}
      ref={ref}
      value={value ?? []}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    >
      {children}
    </Checkbox.Group>
  );
});
