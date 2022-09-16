import styled from "@emotion/styled";
import { SidebarLink } from "../../SidebarItems";
import { PaddedSidebarLink } from "../../MainNavbar.styled";

export const DataAppPageLink = styled(PaddedSidebarLink)<{ indent: number }>`
  ${SidebarLink.NameContainers.join(",")} {
    margin-left: calc(${props => props.indent} * 1rem);
  }
`;
