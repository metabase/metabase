import React from "react";
import { Field } from "formik";
import type { FieldProps } from "formik";
import { FieldTextArea } from "./FormTextArea.styled";

export interface FormTextAreaProps {
  name: string;
  placeholder?: string;
}

const FormTextArea = ({
  name,
  placeholder,
}: FormTextAreaProps): JSX.Element => {
  return (
    <Field name={name}>
      {({ field, meta }: FieldProps) => (
        <FieldTextArea
          {...field}
          className="input"
          placeholder={placeholder}
          touched={meta.touched}
          error={meta.error}
        />
      )}
    </Field>
  );
};

export default FormTextArea;
