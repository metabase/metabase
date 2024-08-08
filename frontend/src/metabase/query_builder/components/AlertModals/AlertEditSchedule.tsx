import cx from "classnames";
import { t } from "ttag";

import type { ScheduleChangeProp } from "metabase/components/Schedule/types";
import SchedulePicker from "metabase/containers/SchedulePicker";
import CS from "metabase/css/core/index.css";
import { ALERT_TYPE_ROWS } from "metabase-lib/v1/Alert";
import type { AlertType } from "metabase-lib/v1/Alert/types";
import type { Alert, ScheduleSettings } from "metabase-types/api";

import { RawDataAlertTip } from "./RawDataAlertTip";

export const getSchedulePickerSendTimeText = (alert: Alert) => {
  const channels = alert.channels.filter(channel => channel.enabled);
  const [channel] = channels;
  if (channels.length === 0) {
    return;
  }
  if (channels.length === 2) {
    return t`Emails and Slack messages will be sent at`;
  }
  if (channel.channel_type === "email") {
    return t`Emails will be sent at`;
  }
  if (channel.channel_type === "slack") {
    return t`Slack messages will be sent at`;
  }
};

export function AlertEditSchedule({
  alert,
  alertType,
  schedule,
  onScheduleChange,
}: {
  alert: Alert;
  alertType: AlertType;
  schedule: ScheduleSettings;
  onScheduleChange: (
    nextSchedule: ScheduleSettings,
    change: ScheduleChangeProp,
  ) => void;
}) {
  return (
    <div>
      <h3 className={cx(CS.mt4, CS.mb3, CS.textDark)}>
        {t`How often should we check for results?`}
      </h3>

      <div className={cx(CS.bordered, CS.rounded, CS.mb2)}>
        {alertType === ALERT_TYPE_ROWS && <RawDataAlertTip />}
        <div className={cx(CS.p3, CS.bgLight)}>
          <SchedulePicker
            schedule={schedule}
            scheduleOptions={["hourly", "daily", "weekly"]}
            onScheduleChange={onScheduleChange}
            textBeforeInterval={t`Check`}
            textBeforeSendTime={getSchedulePickerSendTimeText(alert)}
          />
        </div>
      </div>
    </div>
  );
}
