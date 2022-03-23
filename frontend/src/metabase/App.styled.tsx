import styled from "@emotion/styled";
import { css } from "@emotion/react";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

const coreAppCss = css`
  display: flex;
`;

export const AppContentContainer = styled.div<{ isAdminApp: boolean }>`
  position: relative;
  height: 100vh;

  ${props => !props.isAdminApp && coreAppCss}
`;

export const AppContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: auto;
`;

export const AppBar = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  position: relative;
  padding-left: 1rem;
  padding-right: 1rem;

  background-color: ${color("bg-white")};
  border-bottom: 1px solid ${color("border")};

  z-index: 4;
`;

export const LogoIconWrapper = styled.div`
  cursor: pointer;
`;
