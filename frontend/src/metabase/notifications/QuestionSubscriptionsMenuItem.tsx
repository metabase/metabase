import { t } from "ttag";

import { skipToken, useListCardAlertsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { CommonNotificationsMenuItem } from "metabase/notifications/CommonNotificationsMenuItem";
import { isSubscription } from "metabase/notifications/utils";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import type Question from "metabase-lib/v1/Question";

export function QuestionSubscriptionsMenuItem({
  question,
  onClick,
}: {
  question: Question;
  onClick: () => void;
}) {
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const { data: questionNotifications, isLoading } = useListCardAlertsQuery({
    id: question.id() ?? skipToken,
  });

  const subscriptions = questionNotifications?.filter(isSubscription);

  const showAlerts = question.canRun() && !isLoading && canManageSubscriptions;

  if (!showAlerts) {
    return null;
  }

  const hasSubscriptions = !!subscriptions?.length;

  return (
    <CommonNotificationsMenuItem
      title={hasSubscriptions ? t`Edit subscriptions` : t`Create subscriptions`}
      iconName={hasSubscriptions ? "mail_filled" : "mail"}
      onClick={onClick}
    />
  );
}
