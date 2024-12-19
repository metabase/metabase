import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";

export const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const AppContentContainer = styled.div<{
  isAdminApp: boolean;
}>`
  flex-grow: 1;
  display: flex;
  flex-direction: ${props => (props.isAdminApp ? "column" : "row")};
  position: relative;
  overflow: hidden;
  background-color: ${props =>
    props.isAdminApp ? "var(--mb-color-bg-white)" : color("content")};

  @media print {
    height: 100%;
    overflow: visible !important;
  }
`;

export const AppContent = styled.main`
  width: 100%;
  height: 100%;
  overflow: auto;
  scroll-margin-top: ${APP_BAR_HEIGHT};

  @media print {
    overflow: visible !important;
  }
`;
