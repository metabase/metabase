import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface VariableIconContainerProps {
  isShowingTemplateTagsEditor: boolean;
}

export const VariableIconContainer = styled.a<VariableIconContainerProps>`
  color: ${props => props.isShowingTemplateTagsEditor && color("brand")};
  transition: color 0.3s linear;

  &:hover {
    color: ${color("brand")};
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
