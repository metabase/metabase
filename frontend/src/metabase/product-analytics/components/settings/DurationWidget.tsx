import { t } from "ttag";

import { Group, NumberInput, Select } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { SettingWidgetProps } from "../../settings/types";
import type { Duration, TimeUnit } from "../../spec/types";

const DEFAULT_UNITS: TimeUnit[] = ["hour", "day", "week"];

type DurationWidgetProps = SettingWidgetProps<Duration> & {
  units?: TimeUnit[];
};

export const DurationWidget = ({
  id,
  value,
  onChange,
  units = DEFAULT_UNITS,
}: DurationWidgetProps) => (
  <Group id={id} gap="sm" wrap="nowrap">
    <NumberInput
      w="6rem"
      min={1}
      allowDecimal={false}
      value={value.value}
      aria-label={t`Amount`}
      onChange={(amount) => {
        if (typeof amount === "number" && amount > 0) {
          onChange({ ...value, value: amount });
        }
      }}
    />
    <Select
      flex={1}
      data={units.map((unit) => ({
        value: unit,
        label: Lib.describeTemporalUnit(unit, value.value),
      }))}
      value={value.unit}
      allowDeselect={false}
      aria-label={t`Unit`}
      onChange={(unit) => {
        const selected = units.find((item) => item === unit);
        if (selected !== undefined) {
          onChange({ ...value, unit: selected });
        }
      }}
    />
  </Group>
);
