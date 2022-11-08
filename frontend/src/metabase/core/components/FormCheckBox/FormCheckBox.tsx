import React, { forwardRef, ReactNode, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import CheckBox, { CheckBoxProps } from "metabase/core/components/CheckBox";
import FormField from "metabase/core/components/FormField";

export interface FormCheckBoxProps
  extends Omit<CheckBoxProps, "checked" | "onChange" | "onBlur"> {
  name: string;
  title?: string;
  description?: ReactNode;
}

const FormCheckBox = forwardRef(function FormCheckBox(
  { name, className, style, title, description, ...props }: FormCheckBoxProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onChange, onBlur }, { error, touched }] = useField(name);

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      description={description}
      alignment="start"
      orientation="horizontal"
      htmlFor={id}
      error={touched ? error : undefined}
    >
      <CheckBox
        {...props}
        id={id}
        name={name}
        checked={value}
        onChange={onChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

export default FormCheckBox;
