import { t } from "ttag";

import { Flex, Select, TextInput } from "metabase/ui";
import type { LoggerDurationUnit } from "metabase-types/api";

interface Props {
  duration: string;
  durationUnit: LoggerDurationUnit;
  onDurationChange: (duration: string) => void;
  onDurationUnitChange: (durationUnit: LoggerDurationUnit) => void;
}

export const DurationInput = ({
  duration,
  durationUnit,
  onDurationChange,
  onDurationUnitChange,
}: Props) => {
  return (
    <Flex align="flex-end" gap="md">
      <TextInput
        label={t`Duration`}
        placeholder={t`Duration`}
        required
        type="number"
        value={duration}
        w={80}
        onChange={(event) => onDurationChange(event.target.value)}
      />

      <Select
        data={getData()}
        placeholder={t`Unit`}
        value={durationUnit}
        w={140}
        onChange={onDurationUnitChange}
      />
    </Flex>
  );
};

// Some options are not practically useful
type AllowedTimeUnit = Exclude<
  LoggerDurationUnit,
  "nanoseconds" | "microseconds" | "milliseconds"
>;

// It intentionally is a function and not a module-level constant, so that `t` function works correctly
function getData() {
  /**
   * Using a Record, so that this gives compilation error when TimeUnit is extended,
   * so that whoever changes that type does not forget to update this function.
   */
  const statusNames: { [T in AllowedTimeUnit]: { label: string; value: T } } = {
    seconds: { label: t`Seconds`, value: "seconds" },
    minutes: { label: t`Minutes`, value: "minutes" },
    hours: { label: t`Hours`, value: "hours" },
    days: { label: t`Days`, value: "days" },
  };

  return Object.values(statusNames);
}
