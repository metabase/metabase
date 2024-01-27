import styled from "@emotion/styled";
import { Tabs } from "metabase/ui";
import { color } from "metabase/lib/colors";
import EmptyState from "metabase/components/EmptyState";
import {Container} from "@mantine/core";

export const BrowseAppRoot = styled.div`
  flex: 1;
  border-top: 1px solid #f0f0f0;
`;

export const BrowseTabs = styled(Tabs)`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
  border-bottom-width: 1px ! important;
`;

export const BrowseTabsList = styled(Tabs.List)`
  padding: 0 1rem;
  background-color: ${color("white")};
`

export const BrowseTab = styled(Tabs.Tab)`
  top: 1px;
  margin-bottom: -1px;
`

export const BrowseTabsPanel = styled(Tabs.Panel)`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
  height: 100%;
  padding: 0 1rem;
`;

export const BrowseContainer = styled.div`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  height: 100%;
`;

export const BrowseDataHeader = styled.header`
  display: flex;
  padding: 1rem;
  color: ${color("dark")};
  background-color: ${color("white")};
`;

export const BrowseSectionContainer = styled(Container)`
  max-width: 1014px;
  margin: 0 auto;
  flex: 1;
  display: flex;
  width: 100%;
`

export const CenteredEmptyState = styled(EmptyState)`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  align-items: center;
  justify-content: center;
  height: 100%;
`;
