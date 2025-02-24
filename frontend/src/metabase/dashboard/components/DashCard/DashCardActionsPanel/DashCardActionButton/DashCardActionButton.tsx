import cx from "classnames";
import type { ElementType, HTMLAttributes } from "react";
import { forwardRef } from "react";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon, type IconProps } from "metabase/ui";

import S from "./DashCardActionButton.module.css";

export const HEADER_ICON_SIZE = 16;

interface Props extends HTMLAttributes<HTMLAnchorElement> {
  as?: ElementType;
  tooltip?: string;
}

const DashActionButton = forwardRef<HTMLAnchorElement, Props>(
  function DashActionButton(
    { as: Component = "a", tooltip, children, ...props },
    ref,
  ) {
    return (
      <Component
        {...props}
        className={cx(S.StyledAnchor, props.className)}
        ref={ref}
      >
        <Tooltip tooltip={tooltip}>{children}</Tooltip>
      </Component>
    );
  },
);

const ActionIcon = (props: IconProps) => (
  <Icon size={HEADER_ICON_SIZE} {...props} />
);

export const DashCardActionButton = Object.assign(DashActionButton, {
  Icon: ActionIcon,
  ICON_SIZE: HEADER_ICON_SIZE,
});
