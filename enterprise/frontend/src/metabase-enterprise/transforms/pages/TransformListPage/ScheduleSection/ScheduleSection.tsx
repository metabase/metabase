import { c, t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Schedule } from "metabase/common/components/Schedule";
import { Button, Card, Group, Icon, Stack, Title } from "metabase/ui";
import type { ScheduleType } from "metabase-types/api";

export const DEFAULT_SCHEDULE = "0 0 0 * * ? *";

export const SCHEDULE_OPTIONS: ScheduleType[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
];

export function ScheduleSection() {
  const { value, updateSetting } = useAdminSetting("transform-schedule");

  const handleChange = (newValue: string) => {
    updateSetting({ key: "transform-schedule", value: newValue });
  };

  return (
    <Stack>
      <Group>
        <Title flex={1} order={4}>{t`Schedule for running transforms`}</Title>
        <Button leftSection={<Icon name="play" />}>{t`Run all now`}</Button>
      </Group>
      <Card p="lg" shadow="none" withBorder>
        <Schedule
          cronString={value ?? DEFAULT_SCHEDULE}
          scheduleOptions={SCHEDULE_OPTIONS}
          verb={c("A verb in the imperative mood").t`Run`}
          minutesOnHourPicker
          onScheduleChange={handleChange}
        />
      </Card>
    </Stack>
  );
}
