import { useField } from "formik";
import type { Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { ChipGroupProps } from "metabase/ui";
import { Chip, Group, Text } from "metabase/ui";

export interface FormChipGroupProps
  extends Omit<ChipGroupProps, "value" | "error"> {
  name: string;
  label: string;
}

export const FormChipGroup = forwardRef(function FormChipGroup(
  { name, onChange, label, children, ...props }: FormChipGroupProps,
  ref: Ref<HTMLDivElement>,
) {
  const [{ value }, _, { setValue }] = useField(name);

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      onChange?.(newValue);
    },
    [setValue, onChange],
  );

  return (
    <Chip.Group {...props} value={value ?? undefined} onChange={handleChange}>
      {label && (
        <Text component="label" fw="bold">
          {label}
        </Text>
      )}
      <Group ref={ref}>{children}</Group>
    </Chip.Group>
  );
});
