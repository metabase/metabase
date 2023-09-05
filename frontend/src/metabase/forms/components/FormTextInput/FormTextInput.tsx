import { forwardRef, useCallback } from "react";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { useField } from "formik";
import { TextInput } from "metabase/ui";
import type { TextInputProps } from "metabase/ui";

export interface FormTextInputProps extends TextInputProps {
  name: string;
  nullable?: boolean;
}

export const FormTextInput = forwardRef(function FormTextInput(
  {
    name,
    nullable,
    onChange: onChangeProp,
    onBlur: onBlurProp,
    ...props
  }: FormTextInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);
  const inputValue = value ?? "";
  const inputError = touched ? error : null;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newInputValue = event.target.value;
      const newValue = newInputValue === "" && nullable ? null : newInputValue;
      setValue(newValue);
      onChangeProp?.(event);
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
    <TextInput
      {...props}
      ref={ref}
      name={name}
      value={inputValue}
      error={inputError}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
