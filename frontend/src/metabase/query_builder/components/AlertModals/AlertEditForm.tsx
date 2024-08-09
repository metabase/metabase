import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { AlertType } from "metabase-lib/v1/Alert/types";
import type { Alert, ScheduleSettings } from "metabase-types/api";

import { AlertEditChannels } from "./AlertEditChannels";
import { AlertEditSchedule } from "./AlertEditSchedule";
import { AlertGoalToggles } from "./AlertGoalToggles";
import { getScheduleFromChannel } from "./schedule";

type AlertEditFormProps = {
  alertType: AlertType;
  alert: Alert;
  onAlertChange: (alert: Alert) => void;
};

export const AlertEditForm = ({
  alertType,
  alert,
  onAlertChange,
}: AlertEditFormProps) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const onScheduleChange = (schedule: ScheduleSettings) => {
    // update the same schedule to all channels at once
    onAlertChange({
      ...alert,
      channels: alert.channels.map(channel => ({ ...channel, ...schedule })),
    });
  };

  // the schedule should be same for all channels so we can use the first one
  const schedule = getScheduleFromChannel(alert.channels[0]);

  return (
    <div>
      <AlertGoalToggles
        alertType={alertType}
        alert={alert}
        onAlertChange={onAlertChange}
      />
      <AlertEditSchedule
        alert={alert}
        alertType={alertType}
        schedule={schedule}
        onScheduleChange={onScheduleChange}
      />
      {isAdmin && (
        <AlertEditChannels alert={alert} onAlertChange={onAlertChange} />
      )}
    </div>
  );
};
