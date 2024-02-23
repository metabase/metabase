import { useField } from "formik";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import FormField from "metabase/core/components/FormField";
import type { ToggleProps } from "metabase/core/components/Toggle";
import Toggle from "metabase/core/components/Toggle";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export interface FormToggleProps extends Omit<ToggleProps, "value" | "onBlur"> {
  name: string;
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
}

const FormToggle = forwardRef(function FormToggle(
  {
    name,
    className,
    style,
    title,
    actions,
    description,
    onChange,
    optional,
    ...props
  }: FormToggleProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    (value: boolean) => {
      setValue(value);
      onChange?.(value);
    },
    [setValue, onChange],
  );

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
      optional={optional}
    >
      <Toggle
        {...props}
        id={id}
        name={name}
        value={value ?? false}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormToggle;
