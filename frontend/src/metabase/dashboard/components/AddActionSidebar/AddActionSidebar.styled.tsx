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

export const BorderedSidebarContent = styled(SidebarContent)`
  border-bottom: 1px solid ${color("border")};
`;

export const ClickBehaviorPickerText = styled.div`
  color: ${color("text-medium")};
  margin-bottom: ${space(2)};
  margin-left: ${space(2)};
`;

export const BackButtonContainer = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: bold;

  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const BackButtonIconContainer = styled.div`
  padding: 4px 6px;
  margin-right: 8px;

  border: 1px solid ${color("border")};
  border-radius: 4px;
`;
