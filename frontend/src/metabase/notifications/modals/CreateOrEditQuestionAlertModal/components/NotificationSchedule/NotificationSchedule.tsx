import { type HTMLAttributes, useCallback, useMemo } from "react";
import { c, t } from "ttag";

import {
  cronToScheduleSettings,
  scheduleSettingsToCron,
} from "metabase/admin/performance/utils";
import { Schedule } from "metabase/components/Schedule/Schedule";
import type { ScheduleChangeProp } from "metabase/components/Schedule/types";
import { formatNotificationScheduleDescription } from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import { DEFAULT_ALERT_SCHEDULE } from "metabase/notifications/utils";
import { getSetting } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, type BoxProps, Flex, Text } from "metabase/ui";
import type {
  NotificationCronSubscription,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import styles from "./NotificationSchedule.module.css";
import { NotificationScheduleWarning } from "./NotificationScheduleWarning";

export interface NotificationScheduleProps {
  subscription?: NotificationCronSubscription;
  scheduleOptions: ScheduleType[];
  onScheduleChange: (subscription: NotificationCronSubscription) => void;
}

export const NotificationSchedule = ({
  subscription,
  scheduleOptions,
  onScheduleChange,
  ...boxProps
}: NotificationScheduleProps & BoxProps & HTMLAttributes<HTMLDivElement>) => {
  const timezone = useSelector(state =>
    getSetting(state, "report-timezone-short"),
  );

  const scheduleSettings = useMemo(() => {
    return (
      cronToScheduleSettings(subscription?.cron_schedule) ||
      DEFAULT_ALERT_SCHEDULE
    );
  }, [subscription?.cron_schedule]);

  const handleScheduleChange = useCallback(
    (nextSchedule: ScheduleSettings) => {
      if (nextSchedule.schedule_type && subscription) {
        const newCronSchedule = scheduleSettingsToCron(nextSchedule);
        onScheduleChange({
          ...subscription,
          cron_schedule: newCronSchedule,
        });
      }
    },
    [onScheduleChange, subscription],
  );

  const actionText = t`Alerts will be sent at`;
  const scheduleDescription = useScheduleDescription(
    scheduleSettings,
    timezone,
    actionText,
  );

  return (
    <Box {...boxProps}>
      <Flex className={styles.scheduleContainer} direction="column" gap="md">
        <Schedule
          className={styles.schedule}
          schedule={scheduleSettings}
          scheduleOptions={scheduleOptions}
          labelAlignment="left"
          minutesOnHourPicker
          onScheduleChange={handleScheduleChange}
          verb={c("A verb in the imperative mood").t`Check`}
          aria-label={t`Describe how often the alert notification should be sent`}
        />
        {scheduleDescription && (
          <Text c="var(--mb-color-text-secondary)">{scheduleDescription}</Text>
        )}
      </Flex>
      {showWarning(scheduleSettings) && <NotificationScheduleWarning />}
    </Box>
  );
};

const UNSAFE_SCHEDULE_TYPES = ["minutely", "cron"];
const WARNING_THRESHOLD_MINS = 10;
function showWarning(schedule: ScheduleSettings) {
  if (
    !schedule.schedule_type ||
    !UNSAFE_SCHEDULE_TYPES.includes(schedule.schedule_type)
  ) {
    return false;
  }
  return (
    typeof schedule.schedule_minute === "number" &&
    schedule.schedule_minute < WARNING_THRESHOLD_MINS
  );
}

// No description is necessary for schedule types, which recur periodically.
const PERIODIC_SCHEDULE_TYPES = ["minutely", "hourly"];
function useScheduleDescription(
  schedule: ScheduleSettings,
  timezone: string,
  actionText: string,
) {
  const applicationName = useSelector(getApplicationName);

  if (PERIODIC_SCHEDULE_TYPES.includes(schedule.schedule_type as string)) {
    return null;
  }

  const scheduleDescription = formatNotificationScheduleDescription(schedule);
  if (!scheduleDescription) {
    return null;
  }

  const timezoneLabel = t`${timezone}, your ${applicationName} timezone.`;

  return `${actionText} ${scheduleDescription} ${timezoneLabel}`;
}
