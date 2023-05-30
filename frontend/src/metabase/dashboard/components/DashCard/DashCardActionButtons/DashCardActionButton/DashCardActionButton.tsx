import React from "react";

import { Tooltip } from "metabase/core/components/Tooltip";

import {
  ActionIcon,
  StyledAnchor,
  HEADER_ICON_SIZE,
} from "./DashCardActionButton.styled";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(DashActionButton, {
  Icon: ActionIcon,
  ICON_SIZE: HEADER_ICON_SIZE,
});
