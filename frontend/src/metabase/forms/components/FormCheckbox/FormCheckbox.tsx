import { forwardRef, useCallback } from "react";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { useField } from "formik";
import { Checkbox } from "metabase/ui";
import type { CheckboxProps } from "metabase/ui";

export interface FormCheckboxProps
  extends Omit<CheckboxProps, "value" | "error"> {
  name: string;
}

export const FormCheckbox = forwardRef(function FormCheckbox(
  {
    name,
    onChange: onChangeProp,
    onBlur: onBlurProp,
    ...props
  }: FormCheckboxProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value, onChange, onBlur }, { error, touched }] = useField(name);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event);
      onChangeProp?.(event);
    },
    [onChange, onChangeProp],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onBlur(event);
      onBlurProp?.(event);
    },
    [onBlur, onBlurProp],
  );

  return (
    <Checkbox
      {...props}
      ref={ref}
      value={value ?? false}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
