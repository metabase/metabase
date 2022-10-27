import React from "react";
import { useField } from "formik";
import Toggle, { ToggleProps } from "metabase/core/components/Toggle";

export interface FormToggleProps
  extends Omit<ToggleProps, "value" | "onChange" | "onBlur"> {
  name: string;
}

const FormToggle = ({ name, ...props }: FormToggleProps): JSX.Element => {
  const [field, , helpers] = useField(name);

  return (
    <Toggle
      {...props}
      id={name}
      name={name}
      value={field.value}
      onChange={helpers.setValue}
      onBlur={field.onBlur}
    />
  );
};

export default FormToggle;
