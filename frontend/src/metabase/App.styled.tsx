import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import { NAV_HEIGHT } from "metabase/nav/constants";

export const AppContentContainer = styled.div<{
  isAdminApp: boolean;
  hasAppBar: boolean;
}>`
  display: flex;
  flex-direction: ${props => (props.isAdminApp ? "column" : "row")};
  position: relative;
  overflow: hidden;
  height: ${props =>
    props.hasAppBar ? `calc(100vh - ${NAV_HEIGHT})` : "100vh"};
  background-color: ${color("content")};
`;

export const AppContent = styled.main`
  width: 100%;
  height: 100%;
  overflow: auto;
`;
