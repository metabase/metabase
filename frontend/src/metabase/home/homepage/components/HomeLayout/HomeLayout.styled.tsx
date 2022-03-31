import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import { breakpointMinMedium } from "metabase/styled-components/theme";

export interface LayoutProps {
  showScene?: boolean;
}

export const LayoutRoot = styled.div<LayoutProps>`
  flex: 1;
  background-color: ${color("bg-light")};
  background-image: ${props =>
    !props.showScene &&
    `linear-gradient(
    to bottom,
    ${color("white")},
    ${alpha("brand", 0.2)}`};
`;

export const LayoutBody = styled.div`
  padding: 1.5rem;

  ${breakpointMinMedium} {
    padding: 4rem 7rem;
  }
`;
