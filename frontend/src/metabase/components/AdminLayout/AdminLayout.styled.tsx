import styled from "@emotion/styled";

import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const AdminWrapper = styled.div<{ headerHeight?: number }>`
  height: ${props =>
    props.headerHeight ? `calc(100% - ${props.headerHeight}px)` : "100%"};
  display: flex;
  flex-direction: column;
  padding-inline-start: 2rem;
  position: relative;
`;

export const AdminMain = styled.div`
  display: flex;
  height: 100%;
`;

export const AdminSidebar = styled.div`
  overflow-y: auto;
  /* left padding matches negative margin in standard sidebar component */
  padding-top: 2rem;
  padding-bottom: 2rem;
  padding-inline-start: 0.5em;
  padding-inline-end: 1rem;
  flex-shrink: 0;
`;

export const AdminContent = styled.div`
  overflow-y: auto;
  flex: 1;
  width: 100%;
  padding-top: 2rem;
  padding-bottom: 2rem;
  padding-inline-start: 1rem;
  padding-inline-end: 2rem;
  position: relative;

  ${breakpointMaxSmall} {
    min-width: 100vw;
  }
`;
