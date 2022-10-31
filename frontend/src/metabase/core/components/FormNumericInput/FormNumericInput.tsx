import React, { forwardRef, ReactNode, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import NumericInput, {
  NumericInputProps,
} from "metabase/core/components/NumericInput";
import FormField from "metabase/core/components/FormField";

export interface FormNumericInputProps
  extends Omit<NumericInputProps, "value" | "error" | "onChange" | "onBlur"> {
  name: string;
  title?: string;
  description?: ReactNode;
}

const FormNumericInput = forwardRef(function FormNumericInput(
  {
    name,
    className,
    style,
    title,
    description,
    ...props
  }: FormNumericInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const id = useUniqueId();
  const [field, meta, helpers] = useField(name);

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
