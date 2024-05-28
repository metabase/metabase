import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import { SidebarItem } from "../SidebarItem";

export const BehaviorOptionIcon = styled(SidebarItem.Icon)<{
  isSelected?: boolean;
}>`
  border-color: ${props =>
    props.isSelected ? "transparent" : color("border")};

  .Icon {
    color: ${props => (props.isSelected ? color("white") : color("brand"))};
  }
`;
