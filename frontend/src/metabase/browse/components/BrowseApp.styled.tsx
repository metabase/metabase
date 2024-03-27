import styled from "@emotion/styled";

import EmptyState from "metabase/components/EmptyState";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { Grid, Icon, Tabs } from "metabase/ui";

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
  padding: 0 2.5rem;
  background-color: ${color("white")};
  border-bottom-width: 1px;
`;

export const BrowseTab = styled(Tabs.Tab)`
  top: 1px;
  margin-bottom: 1px;
  border-bottom-width: 3px !important;
  padding: 10px 0px;
  margin-inline-end: 10px;
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
  padding: 0 2.5rem;
`;

export const BrowseContainer = styled.div`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  height: 100%;
`;

export const BrowseDataHeader = styled.header`
  display: flex;
  padding: 1rem 2.5rem;
  padding-bottom: 0.375rem;
  color: ${color("dark")};
  background-color: ${color("white")};
`;

export const BrowseGrid = styled(Grid)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 0rem 1rem;
  margin: 0;
  width: 100%;

  ${breakpointMinSmall} {
    padding-bottom: 2.5rem;
  }
  ${breakpointMinMedium} {
    padding-bottom: 3rem;
  }
`;

export const CenteredEmptyState = styled(EmptyState)`
  display: flex;
  flex: 1;
  flex-flow: column nowrap;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

export const LearnAboutDataIcon = styled(Icon)`
  min-width: 14px;
  min-height: 14px;
`;
