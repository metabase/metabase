import React, { forwardRef, ReactNode, Ref } from "react";
import { useField } from "formik";
import type { FieldValidator } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import NumericInput, {
  NumericInputProps,
} from "metabase/core/components/NumericInput";
import FormField from "metabase/core/components/FormField";

export interface FormInputProps
  extends Omit<NumericInputProps, "value" | "error" | "onChange" | "onBlur"> {
  name: string;
  validate?: FieldValidator;
  title?: string;
  description?: ReactNode;
}

const FormNumericInput = forwardRef(function FormNumericInput(
  {
    name,
    validate,
    className,
    style,
    title,
    description,
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
