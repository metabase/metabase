import { useField, useFormikContext } from "formik";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import SchedulePicker from "metabase/common/components/SchedulePicker/SchedulePickerView";
import { FormField } from "metabase/forms";
import { Box, rem } from "metabase/ui";
import type {
  DatabaseData,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import { ScheduleModePicker } from "./ScheduleModePicker";
import type { ScheduleMode } from "./types";

const DEFAULT_SCHEDULE: ScheduleSettings = {
  schedule_day: "mon",
  schedule_frame: null,
  schedule_hour: 0,
  schedule_type: "daily",
};

const SCHEDULE_OPTIONS: ScheduleType[] = ["daily", "weekly", "monthly"];

export interface DatabaseCacheScheduleFieldProps {
  name: string;
  title?: string;
  description?: ReactNode;
}

export const DatabaseCacheScheduleField = ({
  name,
  title,
  description,
}: DatabaseCacheScheduleFieldProps): JSX.Element => {
  const { values, setFieldValue } = useFormikContext<DatabaseData>();
  const [{ value }, , { setValue }] = useField(name);

  const handleScheduleChange = useCallback(
    (value: ScheduleSettings) => {
      setValue(value);
    },
    [setValue],
  );

  const handleFullSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", true);
    setFieldValue("is_on_demand", false);
    const isChangingOption = !values.is_full_sync;
    if (isChangingOption) {
      // We only want to set the default schedule if user is changing a schedule option.
      setValue(DEFAULT_SCHEDULE);
    } else {
      // "Regularly, on a schedule" ScheduleOption has a form inside.
      // Interacting with form elements causes this handleFullSyncSelect handler to be called.
      // We don't want to reset schedule state in this case.
    }
  }, [setFieldValue, setValue, values]);

  const handleOnDemandSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", false);
    setFieldValue("is_on_demand", true);
    setValue(null);
  }, [setFieldValue, setValue]);

  const handleNoneSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", false);
    setFieldValue("is_on_demand", false);
    setValue(null);
  }, [setFieldValue, setValue]);

  const scheduleMode = getScheduleMode(values);

  const handleScheduleModeChange = (scheduleMode: ScheduleMode) => {
    match(scheduleMode)
      .with("full", handleFullSyncSelect)
      .with("on-demand", handleOnDemandSyncSelect)
      .with("none", handleNoneSyncSelect)
      .exhaustive();
  };

  return (
    <FormField title={title} description={description}>
      <ScheduleModePicker
        value={scheduleMode}
        onChange={handleScheduleModeChange}
      />

      {scheduleMode === "full" && (
        <SchedulePicker
          schedule={value ?? DEFAULT_SCHEDULE}
          scheduleOptions={SCHEDULE_OPTIONS}
          onScheduleChange={handleScheduleChange}
        />
      )}

      {scheduleMode === "on-demand" && (
        <Box c="text-secondary" fz="sm" maw={rem(620)} mt="sm">
          {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
          {t`When a user adds a new filter to a dashboard or a SQL question, Metabase will scan the field(s) mapped to that filter in order to show the list of selectable values.`}
        </Box>
      )}
    </FormField>
  );
};

function getScheduleMode(values: DatabaseData): ScheduleMode {
  if (values.is_full_sync) {
    return "full";
  }

  if (values.is_on_demand) {
    return "on-demand";
  }

  return "none";
}
