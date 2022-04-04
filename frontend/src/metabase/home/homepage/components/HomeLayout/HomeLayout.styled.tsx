import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";

export interface LayoutProps {
  showScene?: boolean;
}

const sceneStyles = css`
  background-color: ${color("bg-light")};
  background-image: url("app/img/bridge.svg");
  background-size: max(1728px, 100%) auto;
  background-repeat: no-repeat;
  background-position: bottom;
`;

const gradientStyles = css`
  background: linear-gradient(
    to bottom,
    ${color("white")},
    ${alpha("brand", 0.2)}
  );
`;

export const LayoutRoot = styled.div<LayoutProps>`
  height: 100%;
  padding: 4rem 7rem;
  ${props => (props.showScene ? sceneStyles : gradientStyles)};
`;

export const LayoutBody = styled.div`
  margin-top: 6rem;
`;
