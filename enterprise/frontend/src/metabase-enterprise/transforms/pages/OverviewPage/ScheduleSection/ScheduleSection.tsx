import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Schedule } from "metabase/common/components/Schedule";
import { Group } from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
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
    <CardSection
      label={t`Schedule`}
      description={t`Pick when your transforms should run.`}
    >
      <Group p="lg">
        <Schedule
          cronString={value ?? DEFAULT_SCHEDULE}
          scheduleOptions={SCHEDULE_OPTIONS}
          verb={t`Run`}
          minutesOnHourPicker
          onScheduleChange={handleChange}
        />
      </Group>
    </CardSection>
  );
}
