import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Input, { InputProps } from "metabase/core/components/Input";
import FormField, {
  FieldAttributes,
  FieldProps,
} from "metabase/core/components/FormField";

export type FormInputProps = FieldAttributes &
  FieldProps &
  Omit<InputProps, "value" | "error" | "onChange" | "onBlur">;

const FormInput = forwardRef(function FormInput(
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
  }: FormInputProps,
  ref: Ref<HTMLInputElement>,
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
      <Input
        {...props}
        id={id}
        name={name}
        value={field.value}
        error={meta.touched && meta.error != null}
        onChange={field.onChange}
        onBlur={field.onBlur}
      />
    </FormField>
  );
});

export default FormInput;
