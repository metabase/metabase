import React, { forwardRef, Key, Ref } from "react";
import { useField } from "formik";
import Radio, { RadioOption, RadioProps } from "metabase/core/components/Radio";
import FormField, {
  FieldAttributes,
  FieldProps,
} from "metabase/core/components/FormField";

export type FormRadioProps<
  TValue extends Key,
  TOption = RadioOption<TValue>,
> = FieldAttributes &
  FieldProps &
  Omit<RadioProps<TValue, TOption>, "value" | "error" | "onChange" | "onBlur">;

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
    alignment,
    orientation,
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
      alignment={alignment}
      orientation={orientation}
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
