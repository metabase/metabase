// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { APP_BAR_HEIGHT } from "metabase/nav/constants";

interface AppBarRootProps {
  hasSidebarOpen?: boolean;
}

export const AppBarRoot = styled.div<AppBarRootProps>`
  display: flex;
  align-items: center;
  gap: 1rem;
  height: ${APP_BAR_HEIGHT};
  padding-left: 1.325rem;
  padding-right: 1rem;
  border-bottom: 1px solid
    ${(props) =>
      props.hasSidebarOpen ? "var(--mb-color-border)" : "transparent"};
  background-color: var(--mb-color-background-primary);
  transition: border-bottom-color 200ms ease;
`;

interface AppBarInfoContainerProps {
  isVisible?: boolean;
}

export const AppBarInfoContainer = styled.div<AppBarInfoContainerProps>`
  display: flex;
  min-width: 0;
  opacity: ${(props) => (props.isVisible ? 1 : 0)};
  visibility: ${(props) => (props.isVisible ? "visible" : "hidden")};
  transition: ${(props) =>
    props.isVisible ? `opacity 0.5s` : `opacity 0.5s, visibility 0s`};
`;
