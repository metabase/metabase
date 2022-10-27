import React from "react";
import { useField } from "formik";
import Select, {
  SelectOption,
  SelectProps,
} from "metabase/core/components/Select";

export interface FormSelectProps<TValue, TOption = SelectOption<TValue>>
  extends Omit<SelectProps<TValue, TOption>, "value" | "onChange"> {
  name: string;
}

function FormSelect<TValue, TOption = SelectOption<TValue>>({
  name,
  ...props
}: FormSelectProps<TValue, TOption>) {
  const [field] = useField(name);

  return (
    <Select
      {...props}
      name={name}
      value={field.value}
      onChange={field.onChange}
      buttonProps={{ id: name, onBlur: field.onBlur }}
    />
  );
}

export default FormSelect;
