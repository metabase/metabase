import styled from "@emotion/styled";
import {
  breakpointMaxSmall,
  breakpointMaxMedium,
} from "metabase/styled-components/theme";
import SaveStatus from "metabase/components/SaveStatus";

export const AdminWrapper = styled.div<{ headerHeight?: number }>`
  height: ${props =>
    props.headerHeight ? `calc(100% - ${props.headerHeight}px)` : "100%"};
  display: flex;
  flex-direction: column;
  padding-left: 2rem;
  position: relative;
`;

export const AdminNotifications = styled.div`
  position: absolute;
  top: 2rem;
  right: 2rem;

  ${breakpointMaxMedium} {
    position: relative;
    top: 0;
    right: 0;
    display: flex;
    justify-content: flex-end;
  }
`;

export const AdminSaveStatus = styled(SaveStatus)`
  ${breakpointMaxMedium} {
    margin-bottom: 2rem;
  }
`;

export const AdminMain = styled.div`
  display: flex;
  height: 100%;
`;

export const AdminSidebar = styled.div`
  overflow-y: auto;
  /* left padding matches negative margin in standard sidebar component */
  padding: 2rem 1rem 2rem 0.5em;
  flex-shrink: 0;
`;

export const AdminContent = styled.div`
  overflow-y: auto;
  flex: 1;
  width: 100%;
  padding: 2rem 2rem 2rem 1rem;
  position: relative;

  ${breakpointMaxSmall} {
    min-width: 100vw;
  }
`;
