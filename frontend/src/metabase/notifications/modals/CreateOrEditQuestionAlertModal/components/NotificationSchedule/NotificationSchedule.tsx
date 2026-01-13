import { type HTMLAttributes, useCallback, useMemo } from "react";
import { c, t } from "ttag";

import {
  cronToScheduleSettings,
  cronUnitToNumber,
  isRepeatingEvery,
} from "metabase/admin/performance/utils";
import { Schedule } from "metabase/common/components/Schedule/Schedule";
import { getScheduleExplanation } from "metabase/lib/cron";
import { formatNotificationScheduleDescription } from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import {
  DEFAULT_ALERT_CRON_SCHEDULE,
  DEFAULT_ALERT_SCHEDULE,
} from "metabase/notifications/utils";
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
  const timezone = useSelector((state) =>
    getSetting(state, "report-timezone-short"),
  );

  const scheduleSettings = useMemo(() => {
    return (
      cronToScheduleSettings(
        subscription?.cron_schedule,
        subscription?.ui_display_type === "cron/raw",
      ) || DEFAULT_ALERT_SCHEDULE
    );
  }, [subscription?.cron_schedule, subscription?.ui_display_type]);

  const cronString = subscription?.cron_schedule || DEFAULT_ALERT_CRON_SCHEDULE;

  const actionText = t`Alerts will be sent`;
  const applicationName = useSelector(getApplicationName);
  const renderScheduleDescription = useMemo(() => {
    // No description is necessary for schedule types, which recur periodically.
    const PERIODIC_SCHEDULE_TYPES = ["every_n_minutes", "hourly"];
    return function ScheduleDescription(
      schedule: ScheduleSettings,
      cronExpression: string,
    ) {
      if (PERIODIC_SCHEDULE_TYPES.includes(schedule.schedule_type as string)) {
        return null;
      }

      if (schedule.schedule_type === "cron") {
        return (
          <Text className={styles.customScheduleExplainer}>
            {`${actionText} ${getScheduleExplanation(cronExpression)}${c("An additional clarification for a human-readable schedule description").t`, according to your ${applicationName} timezone (${timezone}).`}`}
          </Text>
        );
      }

      const scheduleDescription =
        formatNotificationScheduleDescription(schedule);
      if (!scheduleDescription) {
        return null;
      }

      const timezoneLabel = c(
        "An additional clarification for a human-readable schedule description",
      ).t`${timezone}, your ${applicationName} timezone.`;

      return (
        <Text c="text-secondary">
          {`${actionText} ${scheduleDescription} ${timezoneLabel}`}
        </Text>
      );
    };
  }, [actionText, applicationName, timezone]);

  const handleScheduleChange = useCallback(
    (newCronString: string, newSchedule: ScheduleSettings) => {
      if (subscription) {
        onScheduleChange({
          ...subscription,
          cron_schedule: newCronString,
          ui_display_type:
            newSchedule.schedule_type === "cron" ? "cron/raw" : "cron/builder",
        });
      }
    },
    [subscription, onScheduleChange],
  );

  return (
    <Box {...boxProps}>
      <Flex className={styles.scheduleContainer} direction="column" gap="md">
        <Schedule
          verb={c("A verb in the imperative mood").t`Check`}
          cronString={cronString}
          scheduleOptions={scheduleOptions}
          minutesOnHourPicker
          isCustomSchedule={subscription?.ui_display_type === "cron/raw"}
          renderScheduleDescription={renderScheduleDescription}
          onScheduleChange={handleScheduleChange}
          aria-label={t`Describe how often the alert notification should be sent`}
          labelAlignment="left"
          className={styles.schedule}
        />
      </Flex>
      {showWarning(scheduleSettings, cronString) && (
        <NotificationScheduleWarning />
      )}
    </Box>
  );
};

const UNSAFE_SCHEDULE_TYPES = ["every_n_minutes", "cron"];
const WARNING_THRESHOLD_MINS = 10;
function showWarning(schedule: ScheduleSettings, cronString?: string) {
  if (
    !schedule.schedule_type ||
    !UNSAFE_SCHEDULE_TYPES.includes(schedule.schedule_type) ||
    !schedule.schedule_minute
  ) {
    return false;
  }
  if (schedule.schedule_type === "every_n_minutes") {
    return schedule.schedule_minute < WARNING_THRESHOLD_MINS;
  }
  if (schedule.schedule_type === "cron") {
    const [, minute] = cronString?.split(" ") || [];
    return (
      isRepeatingEvery(minute) &&
      cronUnitToNumber(minute) < WARNING_THRESHOLD_MINS
    );
  }
  return false;
}
