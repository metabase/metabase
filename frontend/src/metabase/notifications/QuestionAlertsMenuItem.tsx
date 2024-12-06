import { t } from "ttag";

import { skipToken, useListCardAlertsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { CommonNotificationsMenuItem } from "metabase/notifications/CommonNotificationsMenuItem";
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

  const { data: questionAlerts, isLoading } = useListCardAlertsQuery({
    id: question.id() ?? skipToken,
  });

  const showAlerts = question.canRun() && !isLoading && canManageSubscriptions;

  if (!showAlerts) {
    return null;
  }

  const hasAlerts = !!questionAlerts?.length;

  return (
    <CommonNotificationsMenuItem
      title={hasAlerts ? t`Edit alerts` : t`Create alert`}
      iconName={hasAlerts ? "alert_filled" : "alert"}
      onClick={onClick}
    />
  );
}
