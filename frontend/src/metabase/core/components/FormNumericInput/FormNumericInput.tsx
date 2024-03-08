import { useField } from "formik";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import FormField from "metabase/core/components/FormField";
import type { NumericInputProps } from "metabase/core/components/NumericInput";
import NumericInput from "metabase/core/components/NumericInput";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export interface FormNumericInputProps
  extends Omit<
    NumericInputProps,
    "value" | "error" | "fullWidth" | "onChange" | "onBlur"
  > {
  name: string;
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  nullable?: boolean;
  optional?: boolean;
}

/**
 * @deprecated: use FormNumberInput from "metabase/forms"
 */
const FormNumericInput = forwardRef(function FormNumericInput(
  {
    name,
    className,
    style,
    title,
    actions,
    description,
    nullable,
    optional,
    ...props
  }: FormNumericInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    (value: number | undefined) => {
      setValue(value === undefined && nullable ? null : value);
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
      htmlFor={id}
      error={touched ? error : undefined}
      optional={optional}
    >
      <NumericInput
        {...props}
        id={id}
        name={name}
        value={value ?? undefined}
        error={touched && error != null}
        fullWidth
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormNumericInput;
