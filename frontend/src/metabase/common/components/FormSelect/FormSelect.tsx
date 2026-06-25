import { useField } from "formik";
import type { ReactNode, Ref } from "react";
import { forwardRef, useMemo } from "react";

import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Select } from "metabase/ui";

type FormSelectOption = {
  name: string | number;
  value: string | number;
};

export interface FormSelectProps {
  name: string;
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  options?: FormSelectOption[];
  onChange?: (value: string | number | undefined) => void;
}

/**
 * @deprecated: use FormSelect from "metabase/forms"
 */
export const FormSelect = forwardRef(function FormSelect(
  {
    name,
    className,
    title,
    actions,
    description,
    optional,
    placeholder,
    disabled,
    options = [],
    onChange,
  }: FormSelectProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const data = useMemo(
    () =>
      options.map((option) => ({
        value: String(option.value),
        label: String(option.name),
      })),
    [options],
  );

  const valueByKey = useMemo(
    () =>
      new Map<string, string | number>(
        options.map((option) => [String(option.value), option.value]),
      ),
    [options],
  );

  const handleChange = (selected: string | null) => {
    const nextValue = selected != null ? valueByKey.get(selected) : undefined;
    setValue(nextValue);
    onChange?.(nextValue);
  };

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
        id={id}
        data={data}
        value={value != null ? String(value) : null}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});
