import { useState } from "react";
import { t } from "ttag";

import { Schedule } from "metabase/common/components/Schedule";
import { Card, Flex, Stack, Title } from "metabase/ui";
import type { ScheduleType } from "metabase-types/api";

import S from "./TransformSettingsPage.module.css";

const DEFAULT_SCHEDULE = "0 0 0 * * ? *";

const SCHEDULE_OPTIONS: ScheduleType[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
];

export function TransformSettingsPage() {
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);

  return (
    <Flex
      className={S.root}
      flex={1}
      h="100%"
      direction="column"
      align="center"
      p="xl"
    >
      <Stack w="100%" maw="40rem" gap="xl">
        <Title order={1}>{t`Transforms settings`}</Title>
        <Card p="lg">
          <Stack gap="lg">
            <Title order={4}>{t`Schedule`}</Title>
            <Schedule
              cronString={schedule}
              scheduleOptions={SCHEDULE_OPTIONS}
              onScheduleChange={setSchedule}
            />
          </Stack>
        </Card>
      </Stack>
    </Flex>
  );
}
