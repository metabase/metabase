import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

import { NAV_HEIGHT } from "metabase/nav/constants";

const adminCss = css`
  flex-direction: column;
`;

export const AppContentContainer = styled.div<{ isAdminApp: boolean }>`
  display: flex;
  position: relative;
  height: calc(100vh - ${NAV_HEIGHT});
  overflow: hidden;
  ${props => props.isAdminApp && adminCss}
`;

export const AppContent = styled.div`
  width: 100%;
  overflow: auto;
  background-color: ${color("bg-white")};
`;

export const AppBar = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  background-color: ${color("bg-white")};
  border-bottom: 1px solid ${color("border")};
  z-index: 4;
`;

export const LogoIconWrapper = styled.div<{ sidebarOpen: boolean }>`
  cursor: pointer;
  height: 60px;
  width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${props =>
    props.sidebarOpen ? color("bg-medium") : "transparent"};
  &:hover {
    background-color: ${color("bg-medium")};
  }
`;
