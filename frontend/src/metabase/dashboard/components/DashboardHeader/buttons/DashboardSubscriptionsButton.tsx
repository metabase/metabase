import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useHasEmailSetup } from "metabase/common/hooks";
import { toggleSharing } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import type { ActionIconProps } from "metabase/ui";

export const DashboardSubscriptionsButton = (
  props: ActionIconProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const dispatch = useDispatch();
  const handleClick = () => dispatch(toggleSharing());

  // We decided not to show the subscriptions button if email is not set up
  const hasEmailSetup = useHasEmailSetup();
  if (!hasEmailSetup) {
    return null;
  }

  return (
    <ToolbarButton
      icon="subscription"
      tooltipLabel={t`Subscriptions`}
      onClick={handleClick}
      {...props}
    />
  );
};
