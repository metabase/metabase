import React, {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  Ref,
  useCallback,
} from "react";
import { useField } from "formik";
import Input, { InputProps } from "metabase/core/components/Input";

export interface FormInputProps extends Omit<InputProps, "value" | "error"> {
  name: string;
}

const FormInput = forwardRef(function FormInput(
  { name, onChange, onBlur, ...props }: FormInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [field, meta] = useField(name);
  const { value, onChange: onFieldChange, onBlur: onFieldBlur } = field;
  const { error, touched } = meta;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange?.(event);
      onFieldChange(event);
    },
    [onChange, onFieldChange],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onBlur?.(event);
      onFieldBlur(event);
    },
    [onBlur, onFieldBlur],
  );

  return (
    <Input
      {...props}
      ref={ref}
      name={name}
      value={value}
      error={touched && error != null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});

export default FormInput;
