/* eslint-disable @typescript-eslint/no-unsafe-assignment -- FIXME: any-typed values */
import { useField, useFormikContext } from "formik";
import type { JSX, ReactNode } from "react";
import { useCallback } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Schedule } from "metabase/common/components/Schedule";
import type { ScheduleChangeEvent } from "metabase/common/components/Schedule/types";
import { FormField } from "metabase/forms";
import { Box, rem } from "metabase/ui";
import type {
  DatabaseData,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import { SCAN_ONLY_USED_FIELD_VALUES_SETTING } from "../../utils/settings";

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
    ({ value }: ScheduleChangeEvent) => setValue(value),
    [setValue],
  );

  // Only an existing database can store the setting: the create endpoint does not accept `settings`.
  const canScanOnlyUsed = values.id !== undefined;

  const setScanOnlyUsed = useCallback(
    (isScanOnlyUsed: boolean) => {
      if (canScanOnlyUsed) {
        setFieldValue("settings", {
          ...values.settings,
          [SCAN_ONLY_USED_FIELD_VALUES_SETTING]: isScanOnlyUsed,
        });
      }
    },
    [canScanOnlyUsed, setFieldValue, values.settings],
  );

  const handleScheduledSelect = useCallback(
    (isScanOnlyUsed: boolean) => {
      setFieldValue("is_full_sync", true);
      setFieldValue("is_on_demand", false);
      setScanOnlyUsed(isScanOnlyUsed);
      // Keep the schedule the user has when both modes have one.
      const isChangingFromModeWithoutSchedule = !values.is_full_sync;
      if (isChangingFromModeWithoutSchedule) {
        setValue(DEFAULT_SCHEDULE);
      }
    },
    [setFieldValue, setScanOnlyUsed, setValue, values.is_full_sync],
  );

  const handleOnDemandSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", false);
    setFieldValue("is_on_demand", true);
    setScanOnlyUsed(false);
    setValue(null);
  }, [setFieldValue, setScanOnlyUsed, setValue]);

  const handleNoneSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", false);
    setFieldValue("is_on_demand", false);
    setScanOnlyUsed(false);
    setValue(null);
  }, [setFieldValue, setScanOnlyUsed, setValue]);

  const scheduleMode = getScheduleMode(values);
  const hasSchedule = scheduleMode === "full" || scheduleMode === "full-used";

  const handleScheduleModeChange = (scheduleMode: ScheduleMode) => {
    match(scheduleMode)
      .with("full", () => handleScheduledSelect(false))
      .with("full-used", () => handleScheduledSelect(true))
      .with("on-demand", handleOnDemandSyncSelect)
      .with("none", handleNoneSyncSelect)
      .exhaustive();
  };

  return (
    <FormField mb="lg" title={title} description={description}>
      <ScheduleModePicker
        value={scheduleMode}
        onChange={handleScheduleModeChange}
        hasFullUsedMode={canScanOnlyUsed}
      />

      {hasSchedule && (
        <Schedule
          mt="lg"
          value={value ?? DEFAULT_SCHEDULE}
          scheduleOptions={SCHEDULE_OPTIONS}
          onScheduleChange={handleScheduleChange}
        />
      )}

      {scheduleMode === "full-used" && (
        <Box c="text-secondary" fz="sm" maw={rem(620)} mt="sm">
          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
          {t`Metabase scans a field on this schedule only if someone opened its filter values since the last scan. A list that nobody opened for some days can be up to 14 days old the first time someone opens it again.`}
        </Box>
      )}

      {scheduleMode === "on-demand" && (
        <Box c="text-secondary" fz="sm" maw={rem(620)} mt="sm">
          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
          {t`When a user adds a new filter to a dashboard or a SQL question, Metabase will scan the field(s) mapped to that filter in order to show the list of selectable values.`}
        </Box>
      )}
    </FormField>
  );
};

function getScheduleMode(values: DatabaseData): ScheduleMode {
  if (values.is_full_sync) {
    const isScanOnlyUsed =
      values.settings?.[SCAN_ONLY_USED_FIELD_VALUES_SETTING] === true;
    return isScanOnlyUsed ? "full-used" : "full";
  }

  if (values.is_on_demand) {
    return "on-demand";
  }

  return "none";
}
