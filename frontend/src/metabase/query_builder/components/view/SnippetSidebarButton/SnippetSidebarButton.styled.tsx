import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

interface ButtonRootProps {
  isSelected?: boolean;
}

export const ButtonRoot = styled.a<ButtonRootProps>`
  color: ${props => props.isSelected && color("brand")};
  transition: color 0.3s linear;

  &:hover {
    color: ${color("brand")};
  }
`;
