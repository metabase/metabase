import { t } from "ttag";

import { skipToken, useListCardAlertsQuery } from "metabase/api";
import { ToolbarButton } from "metabase/components/ToolbarButton";
import { useSelector } from "metabase/lib/redux";
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
  const label = hasAlerts ? t`Edit alerts` : t`Create an alert`;

  return (
    <ToolbarButton
      icon={hasAlerts ? "alert_filled" : "alert"}
      data-testid="notifications-menu-button"
      tooltipLabel={label}
      aria-label={label}
      onClick={onClick}
    />
  );
}
