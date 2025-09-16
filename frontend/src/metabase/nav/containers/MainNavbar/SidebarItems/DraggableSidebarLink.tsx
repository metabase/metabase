import { DragIcon, StyledSidebarLink } from "./DraggableSidebarLink.styled";
import type { SidebarLinkProps } from "./SidebarLink";

interface Props extends Omit<SidebarLinkProps, "left"> {
  isDraggable?: boolean;
  isDragging: boolean;
}

export function DraggableSidebarLink({ isDraggable, ...props }: Props) {
  return (
    <StyledSidebarLink
      {...props}
      left={isDraggable && <DragIcon name="grabber" />}
    />
  );
}
