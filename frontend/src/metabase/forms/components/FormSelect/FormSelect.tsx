import { forwardRef, useCallback } from "react";
import type { FocusEvent, Ref } from "react";
import { useField } from "formik";
import { Select } from "metabase/ui";
import type { SelectProps } from "metabase/ui";

export interface FormSelectProps extends Omit<SelectProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
}

export const FormSelect = forwardRef(function FormNumberInput(
  { name, nullable, onChange, onBlur, ...props }: FormSelectProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (newValue: string | null) => {
      if (newValue === null) {
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
    <Select
      {...props}
      ref={ref}
      name={name}
      value={value ?? null}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
