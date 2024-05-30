import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import { SidebarItem } from "../SidebarItem";

export const BehaviorOptionIcon = styled(SidebarItem.Icon)<{
  isSelected?: boolean;
}>`
  border-color: ${props =>
    props.isSelected ? "transparent" : "var(--mb-color-border)"};

  .Icon {
    color: ${props =>
      props.isSelected ? "var(--mb-color-text-white)" : color("brand")};
  }
`;
