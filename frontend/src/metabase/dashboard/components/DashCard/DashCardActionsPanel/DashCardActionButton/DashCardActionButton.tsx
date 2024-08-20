import type { ElementType, HTMLAttributes } from "react";
import { forwardRef } from "react";

import Tooltip from "metabase/core/components/Tooltip";

import {
  ActionIcon,
  HEADER_ICON_SIZE,
  StyledAnchor,
} from "./DashCardActionButton.styled";

interface Props extends HTMLAttributes<HTMLAnchorElement> {
  as?: ElementType;
  tooltip?: string;
}

const DashActionButton = forwardRef<HTMLAnchorElement, Props>(
  function DashActionButton({ as, tooltip, children, ...props }, ref) {
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
