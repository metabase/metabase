import { useField, useFormikContext } from "formik";
import { useEffect } from "react";

import type { SelectOption } from "metabase/ui";

import type { IncrementalSettingsFormValues } from "./form";

export type CheckpointFieldOption = SelectOption & {
  supportsLookback: boolean;
};

// Clears a configured lookback when the selected checkpoint column doesn't support one
// (only date/datetime columns do), so a column change never sends a stale lookback to the API.
export function useClearUnsupportedLookback({
  name,
  options,
}: {
  name: string;
  options: CheckpointFieldOption[];
}) {
  const [{ value: selectedFieldId }] = useField<string | null>(name);
  const { values, setFieldValue } =
    useFormikContext<IncrementalSettingsFormValues>();
  const { lookbackValue } = values;

  useEffect(() => {
    const option = options.find(({ value }) => value === selectedFieldId);
    if (option != null && !option.supportsLookback && lookbackValue != null) {
      setFieldValue("lookbackValue", null);
    }
  }, [options, selectedFieldId, lookbackValue, setFieldValue]);
}
