import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

export interface LayoutProps {
  showScene?: boolean;
}

const sceneStyles = css`
  background-color: ${color("bg-light")};
  background-image: url("app/img/bridge.svg");
  background-size: max(2592px, 100%) auto;
  background-repeat: no-repeat;
  background-position: right bottom;
`;

export const LayoutRoot = styled.div<LayoutProps>`
  min-height: 100vh;
  background-color: ${color("bg-light")};
  ${props => props.showScene && sceneStyles};
`;

export const LayoutBody = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  padding: 0 1rem 2rem;
  min-height: 100vh;
`;

export const LayoutCard = styled.div`
  width: 30.875rem;
  margin-top: 1.5rem;
  padding: 2.5rem 3.5rem;
  background-color: ${color("white")};
  box-shadow: 0 1px 15px ${color("shadow")};
  border-radius: 6px;
`;
