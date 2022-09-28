import styled from "@emotion/styled";
import { DraggableSidebarLink, SidebarLink } from "../../SidebarItems";

export const DataAppPageLink = styled(DraggableSidebarLink)<{ indent: number }>`
  padding-left: 0.75rem;

  ${SidebarLink.NameContainers.join(",")} {
    margin-left: calc(${props => props.indent} * 1rem);
  }
`;
