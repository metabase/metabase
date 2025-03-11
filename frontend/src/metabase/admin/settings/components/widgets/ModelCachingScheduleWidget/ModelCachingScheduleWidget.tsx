import { useCallback, useState } from "react";
import { t } from "ttag";

import { Group, Select, Stack, Text } from "metabase/ui";

import { CronExpressionInput } from "./CronExpressionInput";

interface ModelCachingScheduleWidgetProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

const DEFAULT_CUSTOM_SCHEDULE = "0 * * * ?";

function formatCronExpression(cronExpression: string): string {
  const [, ...partsWithoutSeconds] = cronExpression.split(" ");
  const partsWithoutSecondsAndYear = partsWithoutSeconds.slice(0, -1);
  return partsWithoutSecondsAndYear.join(" ");
}

function isCustomSchedule(
  value: string,
  options: Array<{ value: string; label: string }>,
) {
  const defaultSchedules = options.map(o => o.value);
  return !defaultSchedules.includes(value);
}

export const ModelCachingScheduleWidget = ({
  value,
  options,
  onChange,
}: ModelCachingScheduleWidgetProps) => {
  const [isCustom, setCustom] = useState(isCustomSchedule(value, options));
  const [customCronSchedule, setCustomCronSchedule] = useState<string>(
    // We don't allow to specify the "year" component, but it's present in the value
    // So we need to cut it visually to avoid confusion
    isCustom ? formatCronExpression(value) : "",
  );

  const handleScheduleChange = useCallback(
    (nextValue: string) => {
      if (nextValue === "custom") {
        setCustom(true);
        setCustomCronSchedule(DEFAULT_CUSTOM_SCHEDULE);
        onChange(`0 ${DEFAULT_CUSTOM_SCHEDULE} *`);
      } else {
        setCustom(false);
        setCustomCronSchedule("");
        onChange(nextValue);
      }
    },
    [onChange],
  );

  return (
    <Stack gap={0}>
      <Group align="start">
        <Stack gap={0}>
          <Text fz="0.75rem" fw="700">{t`Refresh models every…`}</Text>
          <Select
            w={120}
            size="md"
            value={isCustom ? "custom" : value}
            onChange={handleScheduleChange}
            data={options}
          />
        </Stack>
        {isCustom && customCronSchedule !== undefined && (
          <Stack gap={0}>
            <CronExpressionInput
              value={customCronSchedule}
              onChange={setCustomCronSchedule}
              onBlurChange={onChange}
            />
          </Stack>
        )}
      </Group>
    </Stack>
  );
};
