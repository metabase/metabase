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
  const [field] = useField(name);

  return (
    <CheckBox
      {...props}
      ref={ref}
      name={name}
      checked={field.value}
      onChange={field.onChange}
      onBlur={field.onBlur}
    />
  );
});

export default FormCheckBox;
