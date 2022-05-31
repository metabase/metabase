import Question from "metabase-lib/lib/Question";
import { VisualizationSettings } from "metabase-types/api/card";
import { User } from "metabase-types/api/user";
import { ALERT_TYPE_ROWS } from "./constants";

export const getDefaultAlert = (
  question: Question,
  user: User,
  visualizationSettings: VisualizationSettings,
) => {
  const alertType = question.alertType(visualizationSettings);
  const typeDependentAlertFields =
    alertType === ALERT_TYPE_ROWS
      ? {
          alert_condition: "rows",
          alert_first_only: false,
        }
      : {
          alert_condition: "goal",
          alert_first_only: true,
          alert_above_goal: true,
        };

  return {
    card: {
      id: question.id(),
      include_csv: false,
      include_xls: false,
    },
    channels: [
      {
        enabled: true,
        channel_type: "email",
        recipients: [user],
        schedule_day: "mon",
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
    ],
    ...typeDependentAlertFields,
  };
};
