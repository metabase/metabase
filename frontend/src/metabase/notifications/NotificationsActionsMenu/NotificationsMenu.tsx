import { type Ref, forwardRef } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";

export const NotificationsMenuTriggerButton = forwardRef(
  function _NotificationsMenuTriggerButton(
    {
      tooltip,
      onClick,
      disabled,
    }: {
      tooltip?: string;
      onClick?: () => void;
      disabled?: boolean;
    },
    ref: Ref<HTMLButtonElement>,
  ) {
    return (
      <ToolbarButton
        ref={ref}
        icon="alert"
        data-testid="notifications-menu-button"
        tooltipLabel={tooltip ?? t`Notifications`}
        aria-label={tooltip ?? t`Notifications`}
        onClick={onClick}
        disabled={disabled}
      />
    );
  },
);
