import React, { forwardRef, Key, Ref } from "react";
import { useField } from "formik";
import Radio, { RadioOption, RadioProps } from "metabase/core/components/Radio";

export interface FormRadioProps<
  TValue extends Key,
  TOption = RadioOption<TValue>,
> extends Omit<RadioProps<TValue, TOption>, "value" | "onChange" | "onBlur"> {
  name: string;
}

const FormRadio = forwardRef(function FormRadio<
  TValue extends Key,
  TOption = RadioOption<TValue>,
>(
  { name, ...props }: FormRadioProps<TValue, TOption>,
  ref: Ref<HTMLDivElement>,
) {
  const [{ value, onBlur }, , { setValue }] = useField(name);

  return (
    <Radio
      {...props}
      ref={ref}
      name={name}
      value={value}
      onChange={setValue}
      onBlur={onBlur}
    />
  );
});

export default FormRadio;
