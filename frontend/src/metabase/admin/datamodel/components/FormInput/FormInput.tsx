import React from "react";
import { Field } from "formik";
import type { FieldProps } from "formik";
import { FieldInput } from "./FormInput.styled";

export interface FormInputProps {
  name: string;
  placeholder?: string;
}

const FormInput = ({ name, placeholder }: FormInputProps): JSX.Element => {
  return (
    <Field name={name}>
      {({ field, meta }: FieldProps) => (
        <FieldInput
          {...field}
          className="input"
          type="text"
          placeholder={placeholder}
          touched={meta.touched}
          error={meta.error}
        />
      )}
    </Field>
  );
};

export default FormInput;
