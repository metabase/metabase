import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import S from "./SidebarItems.module.css";
import { SidebarLink, type SidebarLinkProps } from "./SidebarLink";

interface DraggableSidebarLinkProps extends Omit<SidebarLinkProps, "left"> {
  isDraggable?: boolean;
  isDragging: boolean;
}

export function DraggableSidebarLink({
  isDraggable,
  isDragging,
  className,
  ...props
}: DraggableSidebarLinkProps) {
  return (
    <SidebarLink
      {...props}
      className={cx(S.draggable, { [S.dragging]: isDragging }, className)}
      left={
        isDraggable && (
          <Icon
            className={cx(S.dragIcon, CS.cursorGrab)}
            name="grabber"
            pos="absolute"
            left={2}
            top="50%"
          />
        )
      }
    />
  );
}
