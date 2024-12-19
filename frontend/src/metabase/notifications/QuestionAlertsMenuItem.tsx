import { t } from "ttag";

import { skipToken, useListCardAlertsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { CommonNotificationsMenuItem } from "metabase/notifications/CommonNotificationsMenuItem";
import { hasProperGoalForAlert, isAlert } from "metabase/notifications/utils";
import { getVisualizationSettings } from "metabase/query_builder/selectors";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import type Question from "metabase-lib/v1/Question";

export function QuestionAlertsMenuItem({
  question,
  onClick,
}: {
  question: Question;
  onClick: () => void;
}) {
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);
  const visualizationSettings = useSelector(getVisualizationSettings);

  const { data: questionNotifications, isLoading } = useListCardAlertsQuery({
    id: question.id() ?? skipToken,
  });

  const alerts = questionNotifications?.filter(isAlert);

  const canAddAlertOnThisQuestion = hasProperGoalForAlert({
    question,
    visualizationSettings,
  });
  const showAlerts = question.canRun() && !isLoading && canManageSubscriptions;

  if (!showAlerts || !canAddAlertOnThisQuestion) {
    return null;
  }

  const hasAlerts = !!alerts?.length;

  return (
    <CommonNotificationsMenuItem
      title={hasAlerts ? t`Edit alerts` : t`Create alerts`}
      iconName={hasAlerts ? "alert_filled" : "alert"}
      onClick={onClick}
    />
  );
}
