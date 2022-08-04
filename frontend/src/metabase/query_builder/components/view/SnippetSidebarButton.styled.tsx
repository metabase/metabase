import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface SnippetIconContainerProps {
  isShowingSnippetSidebar: boolean;
}

export const SnippetIconContainer = styled.a<SnippetIconContainerProps>`
  color: ${props => props.isShowingSnippetSidebar && color("brand")};
  transition: color 0.3s linear;

  &:hover {
    color: ${color("brand")};
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
