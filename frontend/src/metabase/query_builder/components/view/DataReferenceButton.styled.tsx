import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface ReferenceIconContainerProps {
  isShowingDataReference: boolean;
}

export const ReferenceIconContainer = styled.a<ReferenceIconContainerProps>`
  color: ${props => props.isShowingDataReference && color("brand")};
  transition: color 0.3s linear;

  &:hover {
    color: ${color("brand")};
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
