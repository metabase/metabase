import React from "react";

import Tooltip from "metabase/components/Tooltip";

import { StyledAnchor } from "./DashboardActionButtons.styled";

interface Props extends React.HTMLAttributes<HTMLAnchorElement> {
  tooltip: string;
  analyticsEvent?: string;
}

function DashActionButton({
  tooltip,
  analyticsEvent,
  children,
  ...props
}: Props) {
  const event = analyticsEvent ? `Dashboard;${analyticsEvent}` : undefined;
  return (
    <StyledAnchor {...props} data-metabase-event={event}>
      <Tooltip tooltip={tooltip}>{children}</Tooltip>
    </StyledAnchor>
  );
}

export default DashActionButton;
