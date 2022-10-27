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
  const [field, , helpers] = useField(name);

  return (
    <Toggle
      {...props}
      ref={ref}
      id={name}
      name={name}
      value={field.value}
      onChange={helpers.setValue}
      onBlur={field.onBlur}
    />
  );
});

export default FormToggle;
