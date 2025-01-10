import { t } from "ttag";

import { skipToken, useListNotificationsQuery } from "metabase/api";
import { CommonNotificationsMenuItem } from "metabase/notifications/NotificationsActionsMenu/CommonNotificationsMenuItem";
import type Question from "metabase-lib/v1/Question";

export function QuestionAlertsMenuItem({
  question,
  onClick,
}: {
  question: Question;
  onClick: () => void;
}) {
  const { data: questionNotifications, isLoading } = useListNotificationsQuery({
    card_id: question.id() ?? skipToken,
  });

  if (isLoading) {
    return null;
  }

  const hasAlerts = !!questionNotifications?.length;

  return (
    <CommonNotificationsMenuItem
      title={hasAlerts ? t`Edit alerts` : t`Create alerts`}
      iconName={hasAlerts ? "alert_filled" : "alert"}
      onClick={onClick}
    />
  );
}
