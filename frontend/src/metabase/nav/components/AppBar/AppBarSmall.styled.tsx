import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";

export const AppBarRoot = styled.div`
  border-bottom: 1px solid ${color("border")};
  background-color: ${color("bg-white")};
`;

export const AppBarHeader = styled.header`
  position: relative;
  height: ${APP_BAR_HEIGHT};
  padding: 0 1rem;
`;

export const AppBarSubheader = styled.div`
  padding: 1rem;
`;

export const AppBarMainContainer = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  height: 100%;
`;

export const AppBarToggleContainer = styled.div`
  flex: 0 0 auto;
`;

export const AppBarSearchContainer = styled.div`
  flex: 1 1 auto;
`;

export interface AppBarLogoContainerProps {
  isVisible?: boolean;
}

export const AppBarLogoContainer = styled.div<AppBarLogoContainerProps>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: ${props => (props.isVisible ? 1 : 0)};
  transition: ${props =>
    props.isVisible ? "opacity 0.3s linear 0.2s" : "none"};
`;
