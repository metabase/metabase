import { useFormikContext } from "formik";
import { useEffect } from "react";
import { t } from "ttag";

import { skipToken, useGetFieldQuery } from "metabase/api";
import { FormField, FormNumberInput, FormSelect } from "metabase/forms";
import { Group } from "metabase/ui";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type { LookbackUnit } from "metabase-types/api";

import type { IncrementalSettingsFormValues } from "./form";

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

  const baseType = field?.base_type;
  const isTemporal = baseType != null && isa(baseType, TYPE.Temporal);
  const isDateOnly = isTemporal && !isa(baseType, TYPE.DateTime);

  // Date-only columns only take day-or-coarser units; snap a finer unit (possible after a
  // checkpoint-field change) back to days. Guarded on a set value — a write here counts as a
  // form change and triggers an inline save.
  useEffect(() => {
    if (
      isDateOnly &&
      values.lookbackValue != null &&
      SUB_DAY_UNITS.has(values.lookbackUnit)
    ) {
      setFieldValue("lookbackUnit", "day");
    }
  }, [isDateOnly, values.lookbackValue, values.lookbackUnit, setFieldValue]);

  if (fieldId == null || !isTemporal) {
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
