import React from "react";

import Tooltip from "metabase/components/Tooltip";

import { ActionIcon, StyledAnchor } from "./DashCardActionButton.styled";

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
  return (
    <StyledAnchor {...props} data-metabase-event={analyticsEvent}>
      <Tooltip tooltip={tooltip}>{children}</Tooltip>
    </StyledAnchor>
  );
}

export default Object.assign(DashActionButton, {
  Icon: ActionIcon,
});
