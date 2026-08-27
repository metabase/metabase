import { type HTMLAttributes, useCallback, useMemo, useState } from "react";
import { c, t } from "ttag";

import { Schedule } from "metabase/common/components/Schedule/Schedule";
import {
  cronToBuilderValue,
  cronUnitToNumber,
  isRepeatingEvery,
} from "metabase/common/components/Schedule/cron";
import type {
  CronString,
  ScheduleBuilderValue,
  ScheduleValue,
  ScheduleValueType,
} from "metabase/common/components/Schedule/domain";
import { isScheduleCronValue } from "metabase/common/components/Schedule/domain";
import type { ScheduleChangeEvent } from "metabase/common/components/Schedule/types";
import {
  DEFAULT_ALERT_SCHEDULE,
  formatNotificationScheduleDescription,
  getScheduleDefaultsWithoutHour,
} from "metabase/notifications/utils";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getSetting } from "metabase/settings";
import { Box, type BoxProps, Flex, Text } from "metabase/ui";
import { getScheduleExplanation } from "metabase/utils/cron";
import type { NotificationCronSubscription } from "metabase-types/api";

import styles from "./NotificationSchedule.module.css";
import { NotificationScheduleWarning } from "./NotificationScheduleWarning";

export interface NotificationScheduleProps {
  initialSubscription?: NotificationCronSubscription;
  scheduleOptions: ScheduleValueType[];
  onScheduleChange: (subscription?: NotificationCronSubscription) => void;
}

export const NotificationSchedule = ({
  initialSubscription,
  scheduleOptions,
  onScheduleChange,
  ...boxProps
}: NotificationScheduleProps & BoxProps & HTMLAttributes<HTMLDivElement>) => {
  const timezone = useSelector((state) =>
    getSetting(state, "report-timezone-short"),
  );

  const [value, setValue] = useState<ScheduleValue>(() => {
    if (!initialSubscription) {
      return { ...DEFAULT_ALERT_SCHEDULE };
    }
    const { ui_display_type, cron_schedule } = initialSubscription;
    if (ui_display_type === "cron/raw") {
      return { schedule_type: "cron", cron: cron_schedule };
    }
    return cronToBuilderValue(cron_schedule) ?? { ...DEFAULT_ALERT_SCHEDULE };
  });

  const actionText = t`Alerts will be sent`;
  const applicationName = useSelector(getApplicationName);
  const renderScheduleDescription = useMemo(() => {
    // No description is necessary for schedule types, which recur periodically.
    const PERIODIC_SCHEDULE_TYPES = ["every_n_minutes", "hourly"];
    return function ScheduleDescription(
      value: ScheduleValue,
      cronExpression: string,
    ) {
      if (PERIODIC_SCHEDULE_TYPES.includes(value.schedule_type)) {
        return null;
      }

      if (isScheduleCronValue(value)) {
        return (
          <Text className={styles.customScheduleExplainer}>
            {`${actionText} ${getScheduleExplanation(cronExpression)}${c("An additional clarification for a human-readable schedule description").t`, according to your ${applicationName} timezone (${timezone}).`}`}
          </Text>
        );
      }

      const scheduleDescription = formatNotificationScheduleDescription(value);
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
    ({ value: nextValue, cronString }: ScheduleChangeEvent) => {
      setValue(nextValue);
      onScheduleChange(
        cronString
          ? {
              type: "notification-subscription/cron",
              event_name: null,
              cron_schedule: cronString,
              ui_display_type: isScheduleCronValue(nextValue)
                ? "cron/raw"
                : "cron/builder",
            }
          : undefined,
      );
    },
    [onScheduleChange],
  );

  return (
    <Box {...boxProps}>
      <Flex className={styles.scheduleContainer} direction="column" gap="md">
        <Schedule
          verb={c("A verb in the imperative mood").t`Check`}
          value={value}
          scheduleOptions={scheduleOptions}
          minutesOnHourPicker
          getDefaults={getScheduleDefaultsWithoutHour}
          renderScheduleDescription={renderScheduleDescription}
          onScheduleChange={handleScheduleChange}
          aria-label={t`Describe how often the alert notification should be sent`}
          labelAlignment="left"
          className={styles.schedule}
        />
      </Flex>
      {showWarning(value) && <NotificationScheduleWarning />}
    </Box>
  );
};

const WARNING_THRESHOLD_MINS = 10;

const showWarning = (value: ScheduleValue) =>
  isScheduleCronValue(value)
    ? isCronRepeatingTooOften(value.cron)
    : isBuilderRepeatingTooOften(value);

const isCronRepeatingTooOften = (cron: CronString) => {
  const [, minute] = cron.split(" ");
  return (
    isRepeatingEvery(minute) &&
    cronUnitToNumber(minute) < WARNING_THRESHOLD_MINS
  );
};

const isBuilderRepeatingTooOften = ({
  schedule_type,
  schedule_minute,
}: ScheduleBuilderValue) =>
  schedule_type === "every_n_minutes" &&
  !!schedule_minute &&
  schedule_minute < WARNING_THRESHOLD_MINS;
