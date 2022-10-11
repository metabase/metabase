import _ from "underscore";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import { SidebarItem } from "../SidebarItem";

export const ActionSidebarItem = styled(SidebarItem.Selectable)<{
  hasDescription?: boolean;
}>`
  align-items: ${props => (props.hasDescription ? "flex-start" : "center")};
  margin-top: 2px;
`;

export const ActionSidebarItemIcon = styled(SidebarItem.Icon)<{
  isSelected?: boolean;
}>`
  .Icon {
    color: ${props =>
      props.isSelected ? color("text-white") : color("brand")};
  }
`;

export const ActionDescription = styled.span<{ isSelected?: boolean }>`
  width: 95%;
  margin-top: 2px;

  color: ${props =>
    props.isSelected ? color("text-white") : color("text-medium")};
`;

export const ClickMappingsContainer = styled.div`
  margin-top: 1rem;
`;

export const ActionPickerWrapper = styled.div`
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 30rem);
  overflow-y: auto;
`;
