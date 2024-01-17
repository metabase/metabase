import styled from "@emotion/styled";
import SaveStatus from "metabase/components/SaveStatus";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const AdminWrapper = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-left: 2rem;
`;

export const AdminNotifications = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export const AdminSaveStatus = styled(SaveStatus)`
  padding: 2rem 2rem 0;
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

  ${breakpointMaxSmall} {
    min-width: 100vw;
  }
`;
