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
    onChange: onChangeProp,
    ...props
  }: FormSelectProps<TValue, TOption>,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onChange, onBlur }, { error, touched }] = useField(name);
  const buttonProps = useMemo(() => ({ id, onBlur }), [id, onBlur]);

  const handleChange = useCallback(
    (event: SelectChangeEvent<TValue>) => {
      onChange(event);
      onChangeProp?.(event);
    },
    [onChange, onChangeProp],
  );

  return (
    <FormField
      ref={ref}
      className={className}
      title={title}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
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

export default FormSelect;
