import styled from "@emotion/styled";

import { SidebarItem } from "../SidebarItem";
import { sidebarItemPaddingStyle } from "../SidebarItem/SidebarItem.styled";

export const LinkTargetEntityPickerContent = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  ${sidebarItemPaddingStyle};
`;

export const SelectedEntityPickerIcon = styled(SidebarItem.Icon)`
  border-color: transparent;
`;

export const SelectedEntityPickerContent = styled(SidebarItem.Content)`
  font-weight: bold;
`;
