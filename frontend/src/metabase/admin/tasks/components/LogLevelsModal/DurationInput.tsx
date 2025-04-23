import { t } from "ttag";

import { Flex, Select, TextInput } from "metabase/ui";
import type { TimeUnit } from "metabase-types/api";

interface Props {
  duration: string;
  durationUnit: TimeUnit;
  onDurationChange: (duration: string) => void;
  onDurationUnitChange: (durationUnit: TimeUnit) => void;
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

// It intentionally is a function and not a module-level constant, so that `t` function works correctly
function getData() {
  /**
   * Using a Record, so that this gives compilation error when TimeUnit is extended,
   * so that whoever changes that type does not forget to update this function.
   */
  const statusNames: { [T in TimeUnit]: { label: string; value: T } } = {
    nanoseconds: { label: t`Nanoseconds`, value: "nanoseconds" },
    microseconds: { label: t`Microseconds`, value: "microseconds" },
    milliseconds: { label: t`Milliseconds`, value: "milliseconds" },
    seconds: { label: t`Seconds`, value: "seconds" },
    minutes: { label: t`Minutes`, value: "minutes" },
    hours: { label: t`Hours`, value: "hours" },
    days: { label: t`Days`, value: "days" },
  };

  return Object.values(statusNames);
}
