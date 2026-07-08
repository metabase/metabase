import { useFormikContext } from "formik";
import { useEffect } from "react";

import type { SelectOption } from "metabase/ui";

type UseAutoSelectFirstOptionProps = {
  name: string;
  options: SelectOption[];
  disabled?: boolean;
};

export function useAutoSelectFirstOption({
  name,
  options,
  disabled,
}: UseAutoSelectFirstOptionProps) {
  const { setFieldValue, values } =
    useFormikContext<Record<string, string | null>>();
  const currentValue = values[name];

  useEffect(() => {
    if (disabled || options.length === 0) {
      return;
    }

    const hasValidCurrentValue =
      currentValue != null &&
      options.some((option) => option.value === currentValue);

    if (hasValidCurrentValue) {
      return;
    }

    setFieldValue(name, options[0].value);
  }, [currentValue, disabled, name, options, setFieldValue]);
}
