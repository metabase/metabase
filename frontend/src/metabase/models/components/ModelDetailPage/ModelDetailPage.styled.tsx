import styled from "@emotion/styled";

import BaseTabPanel from "metabase/core/components/TabPanel";
import { TabRow as BaseTabRow } from "metabase/core/components/TabRow";

export const TabRow = styled(BaseTabRow)`
  margin: 1rem 0;
`;

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
