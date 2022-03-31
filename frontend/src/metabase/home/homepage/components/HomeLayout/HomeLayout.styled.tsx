import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import { css } from "@emotion/react";

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
  background: linear-gradient(90deg, ${color("white")}, ${alpha("brand", 0.2)});
`;

export const LayoutRoot = styled.div<LayoutProps>`
  flex: 1;
  ${props => (props.showScene ? sceneStyles : gradientStyles)};
`;

export const LayoutMain = styled.div`
  padding: 4rem 7rem;
`;

export const LayoutContent = styled.div`
  margin-top: 6rem;
`;
