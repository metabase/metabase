import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { CommonNotificationsMenuItem } from "metabase/notifications/CommonNotificationsMenuItem";
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

  // const { data: questionAlerts, isLoading } = useListCardAlertsQuery({
  //   id: question.id() ?? skipToken,
  // });

  const questionSubscriptions = [];
  const isLoading = false;

  const showAlerts = question.canRun() && !isLoading && canManageSubscriptions;

  if (!showAlerts) {
    return null;
  }

  const hasSubscriptions = !!questionSubscriptions?.length;

  return (
    <CommonNotificationsMenuItem
      title={hasSubscriptions ? t`Edit subscriptions` : t`Create subscription`}
      iconName={hasSubscriptions ? "mail_filled" : "mail"}
      onClick={onClick}
    />
  );
}
