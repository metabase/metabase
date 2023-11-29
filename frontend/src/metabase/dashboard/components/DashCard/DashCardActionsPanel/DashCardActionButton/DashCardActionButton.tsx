import * as React from "react";

import Tooltip from "metabase/core/components/Tooltip";

import {
  ActionIcon,
  StyledAnchor,
  HEADER_ICON_SIZE,
} from "./DashCardActionButton.styled";

interface Props extends React.HTMLAttributes<HTMLAnchorElement> {
  tooltip?: string;
  analyticsEvent?: string;
}

const DashActionButton = React.forwardRef<HTMLAnchorElement, Props>(
  function DashActionButton(
    { tooltip, analyticsEvent, children, ...props },
    ref,
  ) {
    return (
      <StyledAnchor {...props} data-metabase-event={analyticsEvent} ref={ref}>
        <Tooltip tooltip={tooltip}>{children}</Tooltip>
      </StyledAnchor>
    );
  },
);

export const DashCardActionButton = Object.assign(DashActionButton, {
  Icon: ActionIcon,
  ICON_SIZE: HEADER_ICON_SIZE,
});
