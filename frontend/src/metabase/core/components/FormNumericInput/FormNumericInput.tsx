import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import NumericInput, {
  NumericInputProps,
} from "metabase/core/components/NumericInput";
import FormField, {
  FieldAttributes,
  FieldProps,
} from "metabase/core/components/FormField";

export type FormInputProps = FieldAttributes &
  FieldProps &
  Omit<NumericInputProps, "value" | "error" | "onChange" | "onBlur">;

const FormNumericInput = forwardRef(function FormNumericInput(
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
  const [field, meta, helpers] = useField({ name, validate });

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
      <NumericInput
        {...props}
        id={id}
        name={name}
        value={field.value}
        error={meta.touched && meta.error != null}
        onChange={helpers.setValue}
        onBlur={field.onBlur}
      />
    </FormField>
  );
});

export default FormNumericInput;
