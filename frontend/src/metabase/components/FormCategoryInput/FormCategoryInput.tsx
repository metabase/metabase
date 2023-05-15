import React, { forwardRef, ReactNode, Ref, useCallback } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import FormField from "metabase/core/components/FormField";

import type Field from "metabase-lib/metadata/Field";

import CategoryFieldPicker from "./CategoryFieldPicker";

export interface FormCategoryInputProps {
  name: string;
  title?: string;
  description?: ReactNode;
  nullable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  field: Field;
}

const FormCategoryInput = forwardRef(function FormInput(
  {
    name,
    className,
    style,
    title,
    description,
    nullable,
    field,
  }: FormCategoryInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    (newValue: string | null) => {
      setValue(newValue === "" && nullable ? null : newValue);
    },
    [nullable, setValue],
  );

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
    >
      <CategoryFieldPicker
        value={value ?? ""}
        field={field}
        onChange={handleChange}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormCategoryInput;
