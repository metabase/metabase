import { useId } from "react";
import { t } from "ttag";

import { FormNumberInput, FormSelect } from "metabase/forms";
import { Flex, Stack, Text } from "metabase/ui";

import type { AllowedTimeUnit } from "./types";

export const DurationInput = () => {
  const id = useId();

  return (
    <Stack gap={4}>
      <Text
        c="text-primary"
        component="label"
        fw="bold"
        htmlFor={id}
        lh="var(--mantine-line-height-md)"
      >
        {t`Reset to defaults after`}
      </Text>

      <Flex align="flex-end" gap="md">
        <FormNumberInput
          // rendering long error message for 80px-wide input messes up the layout
          // so this error message will be displayed under the form instead
          error={null}
          id={id}
          name="duration"
          placeholder={t`Duration`}
          w={80}
        />

        <FormSelect
          data={getData()}
          placeholder={t`Unit`}
          name="durationUnit"
          w={140}
        />
      </Flex>
    </Stack>
  );
};

// It intentionally is a function and not a module-level constant, so that `t` function works correctly
function getData() {
  /**
   * Using a Record, so that this gives compilation error when TimeUnit is extended,
   * so that whoever changes that type does not forget to update this function.
   *
   * If this needs updating, also update VALIDATION_SCHEMA in LogLevelsModal.
   */
  const statusNames: { [T in AllowedTimeUnit]: { label: string; value: T } } = {
    seconds: { label: t`Seconds`, value: "seconds" },
    minutes: { label: t`Minutes`, value: "minutes" },
    hours: { label: t`Hours`, value: "hours" },
    days: { label: t`Days`, value: "days" },
  };

  return Object.values(statusNames);
}
