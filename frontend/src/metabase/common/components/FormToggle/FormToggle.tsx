import { useField } from "formik";
import type { CSSProperties, ChangeEvent, ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import type { SwitchProps } from "metabase/ui";
import { Switch } from "metabase/ui";

export interface FormToggleProps extends Omit<
  SwitchProps,
  "value" | "onBlur" | "style" | "onChange"
> {
  name: string;
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
  nullable?: boolean;
  style?: CSSProperties;
}

export const FormToggle = forwardRef(function FormToggle(
  {
    name,
    className,
    style,
    title,
    actions,
    description,
    optional,
    nullable: _nullable,
    ...props
  }: FormToggleProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValue(event.currentTarget.checked);
    },
    [setValue],
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
      <Switch
        {...props}
        id={id}
        name={name}
        checked={value ?? false}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});
