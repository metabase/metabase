import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Toggle, { ToggleProps } from "metabase/core/components/Toggle";
import FormField, {
  FieldAttributes,
  FieldProps,
} from "metabase/core/components/FormField";

export type FormToggleProps = FieldAttributes &
  FieldProps &
  Omit<ToggleProps, "value" | "onChange" | "onBlur">;

const FormToggle = forwardRef(function FormToggle(
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
  }: FormToggleProps,
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
      <Toggle
        {...props}
        id={id}
        name={name}
        value={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
      />
    </FormField>
  );
});

export default FormToggle;
