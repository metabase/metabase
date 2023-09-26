import { forwardRef, useCallback } from "react";
import type { FocusEvent, Ref } from "react";
import { useField } from "formik";
import { Radio } from "metabase/ui";
import type { RadioGroupProps } from "metabase/ui";

export interface FormRadioGroupProps
  extends Omit<RadioGroupProps, "value" | "error"> {
  name: string;
}

export const FormRadioGroup = forwardRef(function FormRadioGroup(
  { name, onChange, onBlur, children, ...props }: FormRadioGroupProps,
  ref: Ref<HTMLDivElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (newValue: string) => {
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
    <Radio.Group
      {...props}
      ref={ref}
      value={value ?? undefined}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    >
      {children}
    </Radio.Group>
  );
});
