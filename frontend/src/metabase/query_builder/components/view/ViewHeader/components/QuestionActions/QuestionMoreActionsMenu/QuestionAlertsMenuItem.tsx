import { t } from "ttag";

import { skipToken, useListNotificationsQuery } from "metabase/api";
import { CommonNotificationsMenuItem } from "metabase/notifications/NotificationsActionsMenu/CommonNotificationsMenuItem";
import type Question from "metabase-lib/v1/Question";

// XXX: This is how we determine how to show the alerts button, maybe there are other places like for the dashboard. I need to confirm this later.
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
