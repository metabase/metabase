import { t } from "ttag";

import { skipToken } from "metabase/api/api";
import { useListNotificationsQuery } from "metabase/api/notification";
import { CommonNotificationsMenuItem } from "metabase/notifications/NotificationsActionsMenu/CommonNotificationsMenuItem";
import type Question from "metabase-lib/v1/Question";

export function QuestionAlertsMenuItem({
  question,
  onClick,
}: {
  question: Question;
  onClick: () => void;
}) {
  const id = question.id();
  const { data: questionNotifications, isLoading } = useListNotificationsQuery(
    id == null ? skipToken : { card_id: id, include_inactive: false },
  );

  return (
    <CommonNotificationsMenuItem
      title={
        isLoading
          ? t`Loading…`
          : questionNotifications?.length
            ? t`Edit alerts`
            : t`Create an alert`
      }
      iconName={"alert"}
      disabled={isLoading}
      onClick={onClick}
    />
  );
}
