import styled from "@emotion/styled";
import { SidebarLink } from "../../SidebarItems";

export const DataAppPageLink = styled(SidebarLink)<{ indent: number }>`
  padding-left: 0.5rem;

  ${SidebarLink.NameContainers.join(",")} {
    margin-left: calc(${props => props.indent} * 1rem);
  }
`;
