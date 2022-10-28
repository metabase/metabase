import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import CheckBox, { CheckBoxProps } from "metabase/core/components/CheckBox";
import FormField, {
  FieldAttributes,
  FieldProps,
} from "metabase/core/components/FormField";

export type FormCheckBoxProps = FieldAttributes &
  FieldProps &
  Omit<CheckBoxProps, "checked" | "onChange" | "onBlur">;

const FormCheckBox = forwardRef(function FormCheckBox(
  {
    name,
    validate,
    className,
    style,
    title,
    description,
    alignment,
    orientation,
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
      alignment={alignment}
      orientation={orientation}
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
