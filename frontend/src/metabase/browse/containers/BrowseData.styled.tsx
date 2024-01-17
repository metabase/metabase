import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import Card from "metabase/components/Card";
import { GridItem } from "metabase/components/Grid";
import { Ellipsified } from "metabase/core/components/Ellipsified";

import { Tabs } from "metabase/ui";
import EmptyState from "metabase/components/EmptyState";

export const DatabaseCard = styled(Card)`
  padding: 1.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;

export const DatabaseGridItem = styled(GridItem)`
  width: 100%;

  &:hover {
    color: ${color("brand")};
  }

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;

export const ModelCard = styled(Card)`
  padding: 1.5rem;
  margin-right: 16px;

  &:hover {
    color: ${color("brand")};
  }
  height: 9rem;
  display: flex;
  flex-flow: column nowrap;
  justify-content: space-between;
  align-items: flex-start;

  box-shadow: 0px 1px 4px 0px rgba(0, 0, 0, 0.06) !important;

  // TODO: This feels hacky, is this the right way to do this?
  & .last-edit-info-label-button div,
  & .last-edit-info-label-button span {
    white-space: wrap !important;
    text-align: left;
    font-weight: normal;
  }
`;

export const LastEditedInfoSeparator = styled.span`
  padding: 0 6px;
`;

export const MultilineEllipsified = styled(Ellipsified)`
  white-space: pre-line;
  overflow: hidden;
  text-overflow: ellipsis;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
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

export const SimpleBrowseHeader = styled.h2`
  margin-bottom: 0.35rem;
  margin-right: 1rem;
`;

export const CenteredEmptyState = styled(EmptyState)`
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;

export const GridContainer = styled.div`
  flex: 1;
  display: flex;

  > div {
    height: unset !important;
  }

  .ReactVirtualized__Grid,
  .ReactVirtualized__Grid__innerScrollContainer {
    overflow: visible !important;
  }

  .model-group-header {
    &:not(:first-of-type) {
      border-top: 1px solid #f0f0f0;
    }
    width: calc(100% - 1rem) !important;
    display: flex;
    flex-flow: column nowrap;
    justify-content: flex-end;
    padding-bottom: 1rem;
    margin-right: 1rem;
  }
`;
