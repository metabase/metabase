import { useFormikContext } from "formik";
import { useEffect } from "react";

import type { SelectOption } from "metabase/ui";

type UseAutoSelectFirstOptionProps = {
  name: string;
  options: SelectOption[];
  disabled?: boolean;
  isLoading?: boolean;
  autoSelectFirst?: boolean;
};

export function useAutoSelectFirstOption({
  name,
  options,
  disabled,
  isLoading,
  autoSelectFirst,
}: UseAutoSelectFirstOptionProps) {
  const { setFieldValue, values } =
    useFormikContext<Record<string, string | null>>();
  const currentValue = values[name];

  useEffect(() => {
    if (!autoSelectFirst || disabled || isLoading || options.length === 0) {
      return;
    }

    const hasValidCurrentValue =
      currentValue != null &&
      options.some((option) => option.value === currentValue);

    if (hasValidCurrentValue) {
      return;
    }

    setFieldValue(name, options[0].value);
  }, [
    autoSelectFirst,
    currentValue,
    disabled,
    isLoading,
    name,
    options,
    setFieldValue,
  ]);
}
