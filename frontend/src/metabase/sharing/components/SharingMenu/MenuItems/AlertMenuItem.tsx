import { t } from "ttag";

import { skipToken, useListCardAlertsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import { Center, Icon, Menu, Title } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

export function AlertMenuItem({
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
    <>
      <Menu.Item
        data-testid="question-alert-menu-item"
        my="sm"
        leftSection={
          <Center mr="xs">
            <Icon name={hasAlerts ? "alert_filled" : "alert"} />
          </Center>
        }
        onClick={onClick}
      >
        <Title order={4} c="inherit">
          {hasAlerts ? t`Edit alerts` : t`Create alert`}
        </Title>
      </Menu.Item>
      <Menu.Divider />
    </>
  );
}
