import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";

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

export const LayoutMain = styled.div`
  padding: 4rem 7rem;
`;

export const LayoutContent = styled.div`
  margin-top: 6rem;
`;

export const LayoutScene = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
`;

export const LayoutSceneImage = styled.img`
  position: relative;
  bottom: -3px;
`;
