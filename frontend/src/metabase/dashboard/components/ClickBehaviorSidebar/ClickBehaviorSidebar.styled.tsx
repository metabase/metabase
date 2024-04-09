import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import { SidebarItem } from "./SidebarItem";

export const Heading = styled.h4`
  color: ${color("text-dark")};
  padding-top: 22px;
  padding-bottom: 16px;
  margin-bottom: 8px;
`;

export const SidebarContent = styled.div`
  padding-left: 32px;
  padding-right: 32px;
`;

export const SidebarContentBordered = styled(SidebarContent)`
  padding-bottom: 1rem;
  border-bottom: 1px solid ${color("border")};
`;

export const SidebarHeader = styled.div`
  border-bottom: 1px solid ${color("border")};
  padding-left: 32px;
  padding-right: 36px;
  margin-bottom: 16px;
`;

export const SelectedClickBehaviorItemIcon = styled(SidebarItem.Icon)`
  border-color: transparent;
  padding-left: 12px;
`;
