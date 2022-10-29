import React, { forwardRef, ReactNode, Ref } from "react";
import { useField } from "formik";
import type { FieldValidator } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import CheckBox, { CheckBoxProps } from "metabase/core/components/CheckBox";
import FormField from "metabase/core/components/FormField";

export interface FormCheckBoxProps
  extends Omit<CheckBoxProps, "checked" | "onChange" | "onBlur"> {
  name: string;
  validate?: FieldValidator;
  title?: string;
  description?: ReactNode;
}

const FormCheckBox = forwardRef(function FormCheckBox(
  {
    name,
    validate,
    className,
    style,
    title,
    description,
    ...props
  }: FormCheckBoxProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [field, meta] = useField({ name, validate });

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
      error={meta.touched ? meta.error : undefined}
    >
      <CheckBox
        {...props}
        id={id}
        name={name}
        checked={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
      />
    </FormField>
  );
});

export default FormCheckBox;
