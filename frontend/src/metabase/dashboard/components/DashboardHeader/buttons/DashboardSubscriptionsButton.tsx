import { t } from "ttag";

import { toggleSharing } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

interface DashboardSubscriptionsButtonProps {}
export const DashboardSubscriptionsButton = (
  props: DashboardSubscriptionsButtonProps,
) => {
  const tooltipLabel = t`Subscriptions`;
  const dispatch = useDispatch();
  const handleClick = () => dispatch(toggleSharing());
  return (
    <Tooltip label={tooltipLabel}>
      <ActionIcon onClick={handleClick} aria-label={tooltipLabel} {...props}>
        <Icon name="subscription" />
      </ActionIcon>
    </Tooltip>
  );
};
