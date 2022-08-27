import _ from "underscore";
import styled from "@emotion/styled";

import { SidebarItem } from "../SidebarItem";

export const ActionSidebarItem = styled(SidebarItem.Selectable)<{
  hasDescription?: boolean;
}>`
  align-items: ${props => (props.hasDescription ? "flex-start" : "center")};
  margin-top: 2px;
`;
