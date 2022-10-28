import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import CheckBox, { CheckBoxProps } from "metabase/core/components/CheckBox";

export interface FormCheckBoxProps
  extends Omit<CheckBoxProps, "checked" | "onChange" | "onBlur"> {
  name: string;
}

const FormCheckBox = forwardRef(function FormCheckBox(
  { name, ...props }: FormCheckBoxProps,
  ref: Ref<HTMLLabelElement>,
) {
  const [{ value, onChange, onBlur }] = useField(name);

  return (
    <CheckBox
      {...props}
      ref={ref}
      name={name}
      checked={value}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
});

export default FormCheckBox;
