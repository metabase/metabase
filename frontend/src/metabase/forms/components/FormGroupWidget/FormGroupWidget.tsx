import { forwardRef, useCallback } from "react";
import type { FocusEvent, Ref } from "react";
import { useField } from "formik";
import { Select } from "metabase/ui";
import type { SelectProps } from "metabase/ui";

import type { GroupId } from "metabase-types/api";
import { useGroupListQuery } from "metabase/common/hooks";

interface FormGroupWidgetProps
  extends Omit<SelectProps, "value" | "error" | "data"> {
  name: string;
  nullable?: boolean;
}

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
    // TODO: display a disabled Select when loading?
    // TODO: display error when group list query fails?
    return null;
  }
  const groupOptions = groups.map(({ id, name }) => ({
    value: String(id),
    label: name,
  }));

  return (
    <Select
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
