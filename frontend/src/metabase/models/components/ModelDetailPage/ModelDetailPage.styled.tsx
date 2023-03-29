import styled from "@emotion/styled";

import BaseTabPanel from "metabase/core/components/TabPanel";

export const RootLayout = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;

  padding: 3rem 4rem;
  min-height: 90vh;
`;

export const ModelMain = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;

  padding-right: 3rem;
`;

export const TabPanel = styled(BaseTabPanel)`
  height: 100%;
`;

export const TabPanelContent = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;
