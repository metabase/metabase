import { useFormikContext } from "formik";
import { useEffect } from "react";
import { t } from "ttag";

import { skipToken, useGetFieldQuery } from "metabase/api";
import { FormField, FormNumberInput, FormSelect } from "metabase/forms";
import { Group } from "metabase/ui";
import { isDateWithoutTime } from "metabase-lib/v1/types/utils/isa";
import type { LookbackUnit } from "metabase-types/api";

import {
  type IncrementalSettingsFormValues,
  fieldSupportsLookback,
} from "./form";

const SUB_DAY_UNITS: ReadonlySet<LookbackUnit> = new Set([
  "millisecond",
  "second",
  "minute",
  "hour",
]);

const getUnitOptions = (dateOnly: boolean) => {
  const options: { value: LookbackUnit; label: string }[] = [
    { value: "minute", label: t`minutes` },
    { value: "hour", label: t`hours` },
    { value: "day", label: t`days` },
    { value: "week", label: t`weeks` },
    { value: "month", label: t`months` },
    { value: "year", label: t`years` },
  ];
  return dateOnly
    ? options.filter(({ value }) => !SUB_DAY_UNITS.has(value))
    : options;
};

// The lookback window input: a number plus a unit. Only shown for temporal checkpoint columns —
// the only kind that supports a lookback.
export function LookbackField({ readOnly }: { readOnly?: boolean }) {
  const { values, setFieldValue } =
    useFormikContext<IncrementalSettingsFormValues>();
  const fieldId = values.checkpointFilterFieldId;
  const { data: field } = useGetFieldQuery(
    fieldId != null ? { id: Number(fieldId) } : skipToken,
  );

  const isSupported = fieldSupportsLookback(field);
  const isDateOnly = isDateWithoutTime(field);

  // Keep a configured lookback consistent after a checkpoint-field change: clear it when the new
  // column doesn't support one (hiding the input alone would still submit the stale value), and
  // snap sub-day units back to days on date-only columns. Guarded on a set value — a write here
  // counts as a form change and triggers an inline save.
  useEffect(() => {
    if (field == null || values.lookbackValue == null) {
      return;
    }
    if (!isSupported) {
      setFieldValue("lookbackValue", null);
    } else if (isDateOnly && SUB_DAY_UNITS.has(values.lookbackUnit)) {
      setFieldValue("lookbackUnit", "day");
    }
  }, [
    field,
    isSupported,
    isDateOnly,
    values.lookbackValue,
    values.lookbackUnit,
    setFieldValue,
  ]);

  if (fieldId == null || !isSupported) {
    return null;
  }

  return (
    <FormField
      title={t`Lookback window`}
      description={t`Optional. Re-process this much already-seen data on each run, to catch late-arriving rows.`}
      maw="24rem"
    >
      <Group gap="sm" wrap="nowrap">
        <FormNumberInput
          name="lookbackValue"
          nullable
          min={1}
          placeholder={t`e.g. 4`}
          aria-label={t`Lookback amount`}
          disabled={readOnly}
          w="10rem"
        />
        <FormSelect
          name="lookbackUnit"
          aria-label={t`Lookback unit`}
          data={getUnitOptions(isDateOnly)}
          disabled={readOnly}
          w="9rem"
        />
      </Group>
    </FormField>
  );
}
