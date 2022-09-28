import React, { HTMLAttributes } from "react";

import Icon from "metabase/components/Icon";

import { SidebarLinkProps } from "./SidebarLink";
import {
  DragIconContainer,
  StyledSidebarLink,
} from "./DraggableSidebarLink.styled";

import "./sortable.css";

export interface DraggableSidebarLinkProps
  extends Omit<SidebarLinkProps, "left"> {
  isDragging: boolean;
  DragHandle?: React.ReactElement;
}

const Handle = (props: HTMLAttributes<HTMLDivElement>) => (
  <DragIconContainer {...props}>
    <Icon name="grabber2" size={12} />
  </DragIconContainer>
);

const DefaultHandle = <Handle />;

const DraggableSidebarLink = React.forwardRef<
  HTMLLIElement,
  DraggableSidebarLinkProps
>(function DraggableSidebarLink(
  { DragHandle = DefaultHandle, ...props }: DraggableSidebarLinkProps,
  ref,
) {
  return <StyledSidebarLink {...props} left={DragHandle} ref={ref} />;
});

export default Object.assign(DraggableSidebarLink, {
  Handle,
});
