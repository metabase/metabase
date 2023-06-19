import { forwardRef, ReactNode, Ref, useCallback } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Toggle, { ToggleProps } from "metabase/core/components/Toggle";
import FormField from "metabase/core/components/FormField";

export interface FormToggleProps extends Omit<ToggleProps, "value" | "onBlur"> {
  name: string;
  title?: string;
  description?: ReactNode;
  optional?: boolean;
}

const FormToggle = forwardRef(function FormToggle(
  {
    name,
    className,
    style,
    title,
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
