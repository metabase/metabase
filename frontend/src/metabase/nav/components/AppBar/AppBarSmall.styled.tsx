import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";

export const AppBarRoot = styled.header`
  position: relative;
  height: ${APP_BAR_HEIGHT};
`;

export const AppBarMain = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  height: 100%;
  padding: 0 1rem;
  border-bottom: 1px solid ${color("border")};
  background-color: ${color("bg-white")};
`;

export const AppBarLeftContainer = styled.div`
  flex: 0 0 auto;
`;

export const AppBarRightContainer = styled.div`
  flex: 1 1 auto;
`;

export interface AppBarMiddleContainerProps {
  isVisible?: boolean;
}

export const AppBarMiddleContainer = styled.div<AppBarMiddleContainerProps>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: ${props => (props.isVisible ? 1 : 0)};
  transition: ${props =>
    props.isVisible ? "opacity 0.3s linear 0.2s" : "none"};
`;
