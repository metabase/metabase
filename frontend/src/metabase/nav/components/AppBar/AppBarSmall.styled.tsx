// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { APP_BAR_HEIGHT, APP_SUBHEADER_HEIGHT } from "metabase/nav/constants";

interface AppBarHeaderProps {
  isSubheaderVisible?: boolean;
}

export const AppBarHeader = styled.div<AppBarHeaderProps>`
  position: relative;
  height: ${APP_BAR_HEIGHT};
  padding: 0 1rem;
  border-bottom: 1px solid transparent;
  border-color: ${(props) =>
    !props.isSubheaderVisible && "var(--mb-color-border)"};
`;

interface AppBarSubheaderProps {
  isNavBarOpen?: boolean;
}

export const AppBarSubheader = styled.div<AppBarSubheaderProps>`
  height: ${APP_SUBHEADER_HEIGHT};
  padding: 1rem 1rem 1rem 1.25rem;
  transition: border-bottom-color 200ms ease;
  border-bottom: 1px solid
    ${(props) =>
      props.isNavBarOpen ? "var(--mb-color-border)" : "transparent"};
`;

export const AppBarToggleContainer = styled.div`
  flex: 0 0 auto;
`;

export const AppBarSearchContainer = styled.div`
  flex: 1 1 auto;
`;

interface AppBarLogoContainerProps {
  isVisible?: boolean;
}

export const AppBarLogoContainer = styled.div<AppBarLogoContainerProps>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: ${(props) => (props.isVisible ? 1 : 0)};
  visibility: ${(props) => (props.isVisible ? "visible" : "hidden")};
  transition: ${(props) =>
    props.isVisible ? "opacity 0.3s linear 0.2s" : "none"};
`;

export const AppBarProfileLinkContainer = styled.div`
  color: var(--mb-color-text-tertiary);
`;
