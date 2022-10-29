import React, { forwardRef, Key, ReactNode, Ref } from "react";
import { useField } from "formik";
import type { FieldValidator } from "formik";
import Radio, { RadioOption, RadioProps } from "metabase/core/components/Radio";
import FormField from "metabase/core/components/FormField";

export interface FormRadioProps<
  TValue extends Key,
  TOption = RadioOption<TValue>,
> extends Omit<
    RadioProps<TValue, TOption>,
    "value" | "error" | "onChange" | "onBlur"
  > {
  name: string;
  validate?: FieldValidator;
  title?: string;
  description?: ReactNode;
}

const FormRadio = forwardRef(function FormRadio<
  TValue extends Key,
  TOption = RadioOption<TValue>,
>(
  {
    name,
    validate,
    className,
    style,
    title,
    description,
    ...props
  }: FormRadioProps<TValue, TOption>,
  ref: Ref<HTMLDivElement>,
) {
  const [field, meta, helpers] = useField({ name, validate });

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      description={description}
      error={meta.touched ? meta.error : undefined}
    >
      <Radio
        {...props}
        name={name}
        value={field.value}
        onChange={helpers.setValue}
        onBlur={field.onBlur}
      />
    </FormField>
  );
});

export default FormRadio;
