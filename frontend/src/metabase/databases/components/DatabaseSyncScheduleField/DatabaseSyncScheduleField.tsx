import { useField } from "formik";
import type { JSX, ReactNode } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { Schedule } from "metabase/common/components/Schedule";
import type { ScheduleChangeEvent } from "metabase/common/components/Schedule/types";
import { FormField } from "metabase/forms";
import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

const DEFAULT_SCHEDULE: ScheduleSettings = {
  schedule_day: "mon",
  schedule_frame: null,
  schedule_hour: 0,
  schedule_type: "daily",
};

const SCHEDULE_OPTIONS: ScheduleType[] = ["hourly", "daily"];

export interface DatabaseSyncScheduleFieldProps {
  name: string;
  title?: string;
  description?: ReactNode;
}

const DatabaseSyncScheduleField = ({
  name,
  title,
  description,
}: DatabaseSyncScheduleFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const handleScheduleChange = useCallback(
    ({ value }: ScheduleChangeEvent) => setValue(value),
    [setValue],
  );

  return (
    <FormField title={title} description={description}>
      <Schedule
        mt="lg"
        value={value ?? DEFAULT_SCHEDULE}
        scheduleOptions={SCHEDULE_OPTIONS}
        verb={t`Sync`}
        minutesOnHourPicker
        onScheduleChange={handleScheduleChange}
      />
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSyncScheduleField;
