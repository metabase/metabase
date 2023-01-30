import styled from "@emotion/styled";
import Tab from "metabase/core/components/Tab";
import BaseTabPanel from "metabase/core/components/TabPanel";
import BaseTabList from "metabase/core/components/TabList";
import { color } from "metabase/lib/colors";

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

export const TabList = styled(BaseTabList)`
  margin: 1rem 0;
  border-bottom: 1px solid ${color("border")};

  ${BaseTabList.Content} {
    display: flex;
  }

  ${Tab.Link.Root}:not(:last-child) {
    margin-right: 2rem;
  }
`;

export const TabPanel = styled(BaseTabPanel)`
  height: 100%;
`;

export const TabPanelContent = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;
