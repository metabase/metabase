import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import { APP_BAR_HEIGHT } from "metabase/nav/constants";

export const AppContentContainer = styled.div<{
  isAdminApp: boolean;
  hasAppBar: boolean;
}>`
  display: flex;
  flex-direction: ${props => (props.isAdminApp ? "column" : "row")};
  position: relative;
  overflow: hidden;
  height: ${props =>
    props.hasAppBar ? `calc(100vh - ${APP_BAR_HEIGHT})` : "100vh"};
  background-color: ${props =>
    color(props.isAdminApp ? "bg-white" : "content")};

  @media print {
    height: 100%;
    overflow: visible !important;
  }
`;

export const AppContent = styled.main`
  width: 100%;
  height: 100%;
  overflow: auto;

  @media print {
    overflow: visible !important;
  }
`;
