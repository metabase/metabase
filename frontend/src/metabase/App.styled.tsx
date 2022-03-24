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

export const AppContent = styled.main`
  width: 100%;
  overflow: auto;
  background-color: ${color("content")};
`;
