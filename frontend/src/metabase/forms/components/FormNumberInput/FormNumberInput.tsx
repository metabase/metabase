import { useField } from "formik";
import type { FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { NumberInputProps } from "metabase/ui";
import { NumberInput } from "metabase/ui";

export interface FormNumberInputProps
  extends Omit<NumberInputProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
}

export const FormNumberInput = forwardRef(function FormNumberInput(
  { name, nullable, onChange, onBlur, ...props }: FormNumberInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (newValue: number | "") => {
      if (newValue === "") {
        setValue(nullable ? null : undefined);
      } else {
        setValue(newValue);
      }
      onChange?.(newValue);
    },
    [nullable, setValue, onChange],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
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
