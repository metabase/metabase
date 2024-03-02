import { useField } from "formik";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import FormField from "metabase/core/components/FormField";
import type { InputProps } from "metabase/core/components/Input";
import Input from "metabase/core/components/Input";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export interface FormInputProps
  extends Omit<
    InputProps,
    "value" | "error" | "fullWidth" | "onChange" | "onBlur"
  > {
  name: string;
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  infoTooltip?: string;
  nullable?: boolean;
  optional?: boolean;
}

/**
 * @deprecated: use FormTextInput from "metabase/forms"
 */
const FormInput = forwardRef(function FormInput(
  {
    name,
    className,
    style,
    title,
    actions,
    description,
    infoTooltip,
    nullable,
    optional,
    ...props
  }: FormInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    ({ target: { value } }: ChangeEvent<HTMLInputElement>) => {
      setValue(value === "" && nullable ? null : value);
    },
    [nullable, setValue],
  );

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      actions={actions}
      description={description}
      infoTooltip={infoTooltip}
      htmlFor={id}
      error={touched ? error : undefined}
      optional={optional}
    >
      <Input
        size="large"
        {...props}
        id={id}
        name={name}
        value={value ?? ""}
        error={touched && error != null}
        fullWidth
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormInput;
