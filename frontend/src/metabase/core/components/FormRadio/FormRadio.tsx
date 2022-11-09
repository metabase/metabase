import React, { forwardRef, Key, ReactNode, Ref } from "react";
import { useField } from "formik";
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
  title?: string;
  description?: ReactNode;
}

const FormRadio = forwardRef(function FormRadio<
  TValue extends Key,
  TOption = RadioOption<TValue>,
>(
  {
    name,
    className,
    style,
    title,
    description,
    ...props
  }: FormRadioProps<TValue, TOption>,
  ref: Ref<HTMLDivElement>,
) {
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      description={description}
      error={touched ? error : undefined}
    >
      <Radio
        {...props}
        name={name}
        value={value}
        onChange={setValue}
        onBlur={onBlur}
      />
    </FormField>
  );
});

export default FormRadio;
