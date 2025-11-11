import { t } from "ttag";

import { useHasEmailSetup } from "metabase/common/hooks";
import { toggleSharing } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

export const DashboardSubscriptionsButton = () => {
  const tooltipLabel = t`Subscriptions`;
  const dispatch = useDispatch();
  const handleClick = () => dispatch(toggleSharing());

  // We decided not to show the subscriptions button if email is not set up
  const hasEmailSetup = useHasEmailSetup();
  if (!hasEmailSetup) {
    return null;
  }

  return (
    <Tooltip label={tooltipLabel}>
      <ActionIcon onClick={handleClick} aria-label={tooltipLabel}>
        <Icon name="subscription" />
      </ActionIcon>
    </Tooltip>
  );
};
