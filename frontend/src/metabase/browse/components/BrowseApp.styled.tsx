import styled from "@emotion/styled";
import { Tabs } from "metabase/ui";
import { color } from "metabase/lib/colors";
import EmptyState from "metabase/components/EmptyState";

export const BrowseAppRoot = styled.div`
  height: 100%;
  padding: 1rem;
  margin: 0 0.5rem;
`;

export const BrowseTabs = styled(Tabs)`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
`;

export const BrowseTabsPanel = styled(Tabs.Panel)`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
  height: 100%;
`;

export const BrowseContainer = styled.div`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  height: 100%;
`;

export const BrowseDataHeader = styled.h2`
  display: flex;
  margin-bottom: 1rem;
  color: ${color("dark")};
`;

export const CenteredEmptyState = styled(EmptyState)`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  align-items: center;
  justify-content: center;
  height: 100%;
`;
