import React, { forwardRef, ReactNode, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import NumericInput, {
  NumericInputProps,
} from "metabase/core/components/NumericInput";
import FormField from "metabase/core/components/FormField";

export interface FormNumericInputProps
  extends Omit<
    NumericInputProps,
    "value" | "error" | "fullWidth" | "onChange" | "onBlur"
  > {
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
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
    >
      <NumericInput
        {...props}
        id={id}
        name={name}
        value={value}
        error={touched && error != null}
        fullWidth
        onChange={setValue}
        onBlur={onBlur}
      />
    </FormField>
  );
});

export default FormNumericInput;
