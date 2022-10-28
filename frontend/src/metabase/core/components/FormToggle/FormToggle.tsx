import React, { forwardRef, Ref } from "react";
import { useField } from "formik";
import Toggle, { ToggleProps } from "metabase/core/components/Toggle";

export interface FormToggleProps
  extends Omit<ToggleProps, "value" | "onChange" | "onBlur"> {
  name: string;
}

const FormToggle = forwardRef(function FormToggle(
  { name, ...props }: FormToggleProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value, onBlur }, , { setValue }] = useField(name);

  return (
    <Toggle
      {...props}
      ref={ref}
      id={name}
      name={name}
      value={value}
      onChange={setValue}
      onBlur={onBlur}
    />
  );
});

export default FormToggle;
