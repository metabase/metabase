import cx from "classnames";
import type { ElementType, HTMLAttributes } from "react";
import { forwardRef } from "react";

import { Icon, type IconProps } from "metabase/ui";
import { Tooltip } from "metabase/ui";

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
        <Tooltip label={tooltip} disabled={!tooltip}>
          {children}
        </Tooltip>
      </Component>
    );
  },
);

const ActionIcon = forwardRef<SVGSVGElement, IconProps>(
  function ActionIconInner(props, ref) {
    return <Icon ref={ref} size={HEADER_ICON_SIZE} {...props} />;
  },
);

export const DashCardActionButton = Object.assign(DashActionButton, {
  Icon: ActionIcon,
  ICON_SIZE: HEADER_ICON_SIZE,
});
