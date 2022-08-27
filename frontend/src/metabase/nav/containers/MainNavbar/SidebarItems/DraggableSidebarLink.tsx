import React from "react";

import { SidebarLinkProps } from "./SidebarLink";
import { DragIcon, StyledSidebarLink } from "./DraggableSidebarLink.styled";

interface Props extends Omit<SidebarLinkProps, "left"> {
  isDragging: boolean;
}

function DraggableSidebarLink(props: Props) {
  return (
    <StyledSidebarLink
      {...props}
      left={<DragIcon name="grabber2" size={12} />}
    />
  );
}

export default DraggableSidebarLink;
