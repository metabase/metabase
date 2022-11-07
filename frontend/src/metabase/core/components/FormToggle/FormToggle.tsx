import React, { forwardRef, ReactNode, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Toggle, { ToggleProps } from "metabase/core/components/Toggle";
import FormField from "metabase/core/components/FormField";

export interface FormToggleProps
  extends Omit<ToggleProps, "value" | "onChange" | "onBlur"> {
  name: string;
  title?: string;
  description?: ReactNode;
}

const FormToggle = forwardRef(function FormToggle(
  { name, className, style, title, description, ...props }: FormToggleProps,
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
      orientation="horizontal"
      htmlFor={id}
      error={touched ? error : undefined}
    >
      <Toggle
        {...props}
        id={id}
        name={name}
        value={value}
        onChange={setValue}
        onBlur={onBlur}
      />
    </FormField>
  );
});

export default FormToggle;
