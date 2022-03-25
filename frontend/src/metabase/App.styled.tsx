import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

import { NAV_HEIGHT } from "metabase/nav/constants";
import { space } from "metabase/styled-components/theme";
import Icon from "metabase/components/Icon";

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

export const LogoIconWrapper = styled.div`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  padding: ${space(1)};
  margin-left: ${space(1)};

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

export const SidebarButton = styled(Icon)`
  border: 1px solid ${color("border")};
  padding: ${space(1)};
  border-radius: 4px;
  margin-left: ${space(1)};
  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
    border-color: ${color("brand")};
    cursor: pointer;
  }
`;
