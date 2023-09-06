import { forwardRef, useCallback } from "react";
import type { FocusEvent, Ref } from "react";
import { useField } from "formik";
import { NumberInput } from "metabase/ui";
import type { NumberInputProps } from "metabase/ui";

export interface FormNumberInputProps
  extends Omit<NumberInputProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
}

export const FormNumberInput = forwardRef(function FormNumberInput(
  {
    name,
    nullable,
    onChange: onChangeProp,
    onBlur: onBlurProp,
    ...props
  }: FormNumberInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    (newValue: number | "") => {
      if (newValue === "") {
        setValue(nullable ? null : undefined);
      } else {
        setValue(newValue);
      }
      onChangeProp?.(newValue);
    },
    [nullable, setValue, onChangeProp],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onBlur(event);
      onBlurProp?.(event);
    },
    [onBlur, onBlurProp],
  );

  return (
    <NumberInput
      {...props}
      ref={ref}
      name={name}
      value={value ?? ""}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
