import { t } from "ttag";

import { skipToken, useListCardAlertsQuery } from "metabase/api";
import { CommonNotificationsMenuItem } from "metabase/notifications/NotificationsActionsMenu/CommonNotificationsMenuItem";
import { isSubscription } from "metabase/notifications/utils";
import type Question from "metabase-lib/v1/Question";

export function QuestionSubscriptionsMenuItem({
  question,
  onClick,
}: {
  question: Question;
  onClick: () => void;
}) {
  const { data: questionNotifications, isLoading } = useListCardAlertsQuery({
    id: question.id() ?? skipToken,
  });

  if (isLoading) {
    return null;
  }

  const subscriptions = questionNotifications?.filter(isSubscription);
  const hasSubscriptions = !!subscriptions?.length;

  return (
    <CommonNotificationsMenuItem
      title={hasSubscriptions ? t`Edit subscriptions` : t`Create subscriptions`}
      iconName={hasSubscriptions ? "mail_filled" : "mail"}
      onClick={onClick}
    />
  );
}
