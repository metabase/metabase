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
    include_inactive: false,
  });

  if (isLoading) {
    return null;
  }

  return (
    <CommonNotificationsMenuItem
      title={questionNotifications?.length ? t`Edit alerts` : t`Create alerts`}
      iconName={"alert"}
      onClick={onClick}
    />
  );
}
