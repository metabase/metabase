import { useField } from "formik";
import type { FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { useGroupListQuery } from "metabase/common/hooks";
import type { SelectProps } from "metabase/ui";
import { Select, Loader } from "metabase/ui";
import type { GroupId } from "metabase-types/api";

interface FormGroupWidgetProps
  extends Omit<SelectProps, "value" | "error" | "data"> {
  name: string;
  nullable?: boolean;
}

// single-select widget for selecting a permissions group
export const FormGroupWidget = forwardRef(function FormGroupWidget(
  { name, nullable, onChange, onBlur, ...props }: FormGroupWidgetProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] = useField<
    GroupId | null | undefined
  >(name);

  const handleChange = useCallback(
    (newValue: string) => {
      const newGroupId = parseInt(newValue, 10);
      setValue(newGroupId);
    },
    [setValue],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
  );

  const { data: groups, isLoading } = useGroupListQuery();
  if (isLoading || !groups) {
    return <Loader size={16} />;
  }

  const groupOptions = groups.map(({ id, name }) => ({
    value: String(id),
    label: name,
  }));

  return (
    <Select
      placeholder={t`Select a group`}
      {...props}
      ref={ref}
      name={name}
      value={value == null ? value : String(value)}
      error={touched ? error : null}
      data={groupOptions}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
