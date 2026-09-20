import { useField } from "formik";
import type { Ref } from "react";
import { forwardRef, useCallback } from "react";

import { IconPicker } from "metabase/common/components/IconPicker";
import { Stack, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

export interface FormIconPickerProps {
  name: string;
  label?: string;
}

export const FormIconPicker = forwardRef(function FormIconPicker(
  { name, label }: FormIconPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const [{ value }, _meta, { setValue }] = useField(name);

  const handleChange = useCallback(
    (icon: IconName | null) => {
      setValue(icon);
    },
    [setValue],
  );

  return (
    <Stack ref={ref} gap="xs">
      {label && (
        <Text component="label" fw="bold">
          {label}
        </Text>
      )}
      <IconPicker
        value={value ?? null}
        onChange={handleChange}
        label={label}
        data-testid={`${name}-icon-picker`}
      />
    </Stack>
  );
});
