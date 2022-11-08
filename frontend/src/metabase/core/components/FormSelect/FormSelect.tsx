import React, { forwardRef, ReactNode, Ref, useMemo } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Select, {
  SelectOption,
  SelectProps,
} from "metabase/core/components/Select";
import FormField from "metabase/core/components/FormField";

export interface FormSelectProps<TValue, TOption = SelectOption<TValue>>
  extends Omit<SelectProps<TValue, TOption>, "value" | "onChange"> {
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
    ...props
  }: FormSelectProps<TValue, TOption>,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onChange, onBlur }, { error, touched }] = useField(name);
  const buttonProps = useMemo(() => ({ id, onBlur }), [id, onBlur]);

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
        onChange={onChange}
        buttonProps={buttonProps}
      />
    </FormField>
  );
});

export default FormSelect;
