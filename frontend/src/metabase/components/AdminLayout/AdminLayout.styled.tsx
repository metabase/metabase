// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const AdminWrapper = styled.div<{ headerHeight?: number }>`
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
`;

export const AdminMain = styled.div`
  display: flex;
  height: 100%;
`;

export const AdminSidebar = styled.div`
  padding-top: 1rem;
  overflow-y: auto;
  flex-shrink: 0;
  height: 100%;
  border-right: 1px solid var(--mb-color-border);
`;

export const AdminContent = styled.div`
  background-color: var(--mb-color-bg-light);
  overflow-y: auto;
  flex: 1;
  width: 100%;
  padding: 2rem;
  position: relative;
  height: 100%;
  justify-content: center;
  display: flex;

  ${breakpointMaxSmall} {
    min-width: 100vw;
  }
`;
