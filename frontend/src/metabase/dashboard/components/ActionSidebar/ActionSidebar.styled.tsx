import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Heading = styled.h4`
  color: ${color("text-dark")};
  font-size: 1.125rem;
`;

export const SidebarContent = styled.div`
  padding: 1rem 2rem;
`;

export const SidebarHeader = styled(SidebarContent)`
  border-bottom: 1px solid ${color("border")};
`;

export const SidebarBody = styled(SidebarContent)`
  flex: 1;
  overflow-y: auto;
`;

export const SidebarFooter = styled(SidebarContent)`
  justify-content: flex-end;
  display: flex;
  border-top: 1px solid ${color("border")};
`;

export const ClickBehaviorPickerText = styled.div`
  color: ${color("text-medium")};
  margin-bottom: ${space(2)};
  margin-left: ${space(2)};
`;

export const ChangeActionContainer = styled.div`
  display: flex;
  justify-content: space-between;
`;
