import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

interface ButtonRootProps {
  isSelected?: boolean;
}

export const ButtonRoot = styled.a<ButtonRootProps>`
  color: ${props => !props.isSelected && color("text-dark")};

  &:hover {
    color: ${props => props.isSelected && color("brand")};
  }
`;
