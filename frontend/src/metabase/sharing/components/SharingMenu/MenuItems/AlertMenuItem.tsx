import { t } from "ttag";

import { useListCardAlertsQuery, skipToken } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Menu, Center, Icon, Title } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

export function AlertMenuItem({
  question,
  onClick,
}: {
  question: Question;
  onClick: () => void;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const isEmailSetup = useSetting("email-configured?");
  const isSlackSetup = useSetting("slack-token-valid?");
  const hasDeliveryChannel = isEmailSetup || isSlackSetup;
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const { data: questionAlerts, isLoading } = useListCardAlertsQuery({
    id: question.id() ?? skipToken,
  });

  const showAlerts =
    (isAdmin || hasDeliveryChannel) &&
    question.canRun() &&
    !isLoading &&
    canManageSubscriptions;

  if (!showAlerts) {
    return null;
  }

  const hasAlerts = !!questionAlerts?.length;

  return (
    <>
      <Menu.Item
        data-testid="question-alert-menu-item"
        my="sm"
        icon={
          <Center mr="xs">
            <Icon name={hasAlerts ? "alert_filled" : "alert"} />
          </Center>
        }
        disabled={!hasDeliveryChannel}
        onClick={onClick}
      >
        <Title order={4}>{hasAlerts ? t`Edit Alerts` : t`Create alert`}</Title>
      </Menu.Item>
      <Menu.Divider />
    </>
  );
}
