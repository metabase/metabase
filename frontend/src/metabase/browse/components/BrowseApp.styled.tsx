import styled from "@emotion/styled";
import { Tabs } from "metabase/ui";
import { color } from "metabase/lib/colors";
import EmptyState from "metabase/components/EmptyState";

export const BrowseAppRoot = styled.div`
  flex: 1;
  height: 100%;
`;

export const BrowseTabs = styled(Tabs)`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
`;

export const BrowseTabsList = styled(Tabs.List)`
  padding: 0 1rem;
  background-color: ${color("white")};
  border-bottom-width: 1px;
`;

export const BrowseTab = styled(Tabs.Tab)`
  top: 1px;
  margin-bottom: 1px;
  border-bottom-width: 3px !important;
  padding: 10px;
  &:hover {
    color: ${color("brand")};
    background-color: inherit;
    border-color: transparent;
  }
`;

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
  padding-bottom: 0.375rem;
  color: ${color("dark")};
  background-color: ${color("white")};
`;

export const BrowseSectionContainer = styled.div`
  max-width: 1014px;
  margin: 0 auto;
  flex: 1;
  display: flex;
  width: 100%;
`;

export const BrowseTabsContainer = styled(BrowseSectionContainer)`
  flex-flow: column nowrap;
  justify-content: flex-start;
`;

export const CenteredEmptyState = styled(EmptyState)`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  align-items: center;
  justify-content: center;
  height: 100%;
`;
