import React, { useMemo } from "react";
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
  const [{ value, onChange, onBlur }] = useField(name);
  const buttonProps = useMemo(() => ({ id: name, onBlur }), [name, onBlur]);

  return (
    <Select
      {...props}
      name={name}
      value={value}
      onChange={onChange}
      buttonProps={buttonProps}
    />
  );
}

export default FormSelect;
