import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Heading = styled.h4`
  color: ${color("text-dark")};
  font-size: 1.125rem;
  padding-top: 22px;
  padding-bottom: 16px;
  margin-bottom: 8px;
`;

export const SidebarContent = styled.div`
  padding-left: 32px;
  padding-right: 32px;
`;

export const ClickBehaviorPickerText = styled.div`
  color: ${color("text-medium")};
  margin-bottom: ${space(2)};
`;
