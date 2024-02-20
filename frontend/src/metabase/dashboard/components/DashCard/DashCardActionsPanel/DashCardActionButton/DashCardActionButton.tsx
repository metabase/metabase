import type { ElementType, HTMLAttributes } from "react";
import { forwardRef } from "react";

import Tooltip from "metabase/core/components/Tooltip";

import {
  ActionIcon,
  StyledAnchor,
  HEADER_ICON_SIZE,
} from "./DashCardActionButton.styled";

interface Props extends HTMLAttributes<HTMLAnchorElement> {
  as?: ElementType;
  tooltip?: string;
  analyticsEvent?: string;
}

const DashActionButton = forwardRef<HTMLAnchorElement, Props>(
  function DashActionButton(
    { as, tooltip, analyticsEvent, children, ...props },
    ref,
  ) {
    return (
      <StyledAnchor {...props} as={as} ref={ref}>
        <Tooltip tooltip={tooltip}>{children}</Tooltip>
      </StyledAnchor>
    );
  },
);

export const DashCardActionButton = Object.assign(DashActionButton, {
  Icon: ActionIcon,
  ICON_SIZE: HEADER_ICON_SIZE,
});
