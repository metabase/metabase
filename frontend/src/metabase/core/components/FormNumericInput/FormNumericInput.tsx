import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import NumericInput, {
  NumericInputProps,
} from "metabase/core/components/NumericInput";

export interface FormNumericInputProps
  extends Omit<NumericInputProps, "value" | "error" | "onChange" | "onBlur"> {
  name: string;
}

const FormNumericInput = forwardRef(function FormNumericInput(
  { name, ...props }: FormNumericInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [field, meta, helpers] = useField(name);

  return (
    <NumericInput
      {...props}
      ref={ref}
      id={name}
      name={name}
      value={field.value}
      error={meta.touched && meta.error != null}
      onChange={helpers.setValue}
      onBlur={field.onBlur}
    />
  );
});

export default FormNumericInput;
