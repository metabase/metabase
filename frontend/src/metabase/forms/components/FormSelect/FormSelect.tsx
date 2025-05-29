import type { FieldValidator } from "formik";
import { useField } from "formik";
import type { FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { SelectProps } from "metabase/ui";
import { Select } from "metabase/ui";

export interface FormSelectProps extends Omit<SelectProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
  validate?: FieldValidator;
  shouldCastValueToNumber?: boolean;
}

const castToNumber = (value: string): number => parseInt(value, 10);

export const FormSelect = forwardRef(function FormSelect(
  {
    name,
    nullable,
    shouldCastValueToNumber,
    onChange,
    onBlur,
    validate,
    ...props
  }: FormSelectProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] = useField({
    name,
    validate,
  });

  const handleChange = useCallback(
    (newValue: string | null) => {
      if (newValue === null) {
        setValue(nullable ? null : undefined);
      } else {
        setValue(shouldCastValueToNumber ? castToNumber(newValue) : newValue);
      }
      onChange?.(newValue ?? "");
    },
    [onChange, setValue, nullable, shouldCastValueToNumber],
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
      value={shouldCastValueToNumber ? String(value) : (value ?? null)}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
