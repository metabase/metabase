import { DragIcon, StyledSidebarLink } from "./DraggableSidebarLink.styled";
import type { SidebarLinkProps } from "./SidebarLink";

interface Props extends Omit<SidebarLinkProps, "left"> {
  isDragging: boolean;
}

export function DraggableSidebarLink(props: Props) {
  return <StyledSidebarLink {...props} left={<DragIcon name="grabber" />} />;
}
