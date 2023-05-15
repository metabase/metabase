import React, { forwardRef, ReactNode, Ref, useCallback, useMemo } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Select, {
  SelectChangeEvent,
  SelectOption,
  SelectProps,
} from "metabase/core/components/Select";
import FormField from "metabase/core/components/FormField";

export interface FormSelectProps<TValue, TOption = SelectOption<TValue>>
  extends Omit<SelectProps<TValue, TOption>, "value"> {
  name: string;
  title?: string;
  description?: ReactNode;
  optional?: boolean;
}

const FormSelect = forwardRef(function FormSelect<
  TValue,
  TOption = SelectOption<TValue>,
>(
  {
    name,
    className,
    title,
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
