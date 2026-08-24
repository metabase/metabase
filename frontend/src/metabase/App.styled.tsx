// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const AppContentContainer = styled.div<{
  isAdminApp: boolean;
}>`
  flex-grow: 1;
  display: flex;
  flex-direction: ${(props) => (props.isAdminApp ? "column" : "row")};
  position: relative;
  overflow: hidden;
  background-color: ${(props) =>
    props.isAdminApp
      ? "var(--mb-color-background_page-primary)"
      : "var(--mb-color-background_page-primary)"};

  @media print {
    height: 100%;
    overflow: visible !important;
  }
`;

export const AppContent = styled.main`
  width: 100%;
  height: 100%;
  overflow: auto;
  scroll-margin-top: var(--mb-app-bar-height);

  @media print {
    overflow: visible !important;
  }
`;
