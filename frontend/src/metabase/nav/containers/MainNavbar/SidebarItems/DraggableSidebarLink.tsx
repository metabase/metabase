import { DragIcon, StyledSidebarLink } from "./DraggableSidebarLink.styled";
import type { SidebarLinkProps } from "./SidebarLink";

import "./sortable.module.css";

interface Props extends Omit<SidebarLinkProps, "left"> {
  isDragging: boolean;
}

function DraggableSidebarLink(props: Props) {
  return <StyledSidebarLink {...props} left={<DragIcon name="grabber" />} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DraggableSidebarLink;
