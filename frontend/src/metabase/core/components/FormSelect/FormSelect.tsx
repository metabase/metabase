import { useField } from "formik";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback, useMemo } from "react";

import FormField from "metabase/core/components/FormField";
import type {
  SelectChangeEvent,
  SelectOption,
  SelectProps,
} from "metabase/core/components/Select";
import Select from "metabase/core/components/Select";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export interface FormSelectProps<TValue, TOption = SelectOption<TValue>>
  extends Omit<SelectProps<TValue, TOption>, "value"> {
  name: string;
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
}

/**
 * @deprecated: use FormSelect from "metabase/forms"
 */
const FormSelect = forwardRef(function FormSelect<
  TValue,
  TOption = SelectOption<TValue>,
>(
  {
    name,
    className,
    title,
    actions,
    description,
    onChange,
    optional,
    ...props
  }: FormSelectProps<TValue, TOption>,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);
  const buttonProps = useMemo(() => ({ id, onBlur }), [id, onBlur]);

  const handleChange = useCallback(
    (event: SelectChangeEvent<TValue>) => {
      setValue(event.target.value);
      onChange?.(event);
    },
    [setValue, onChange],
  );

  return (
    <FormField
      ref={ref}
      className={className}
      title={title}
      actions={actions}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
      optional={optional}
    >
      <Select
        {...props}
        name={name}
        value={value}
        onChange={handleChange}
        buttonProps={buttonProps}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormSelect;
