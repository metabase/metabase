import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Tabs } from "metabase/ui";

export const TabsList = styled(Tabs.List)`
  padding: 0 2.5rem;
  background-color: ${color("white")};
  border-bottom-width: 1px;
`;

export const Tab = styled(Tabs.Tab)`
  top: 1px;
  margin-bottom: 1px;
  border-bottom-width: 3px !important;
  padding: 10px 0px;
  margin-right: 10px;
  &:hover {
    color: ${color("brand")};
    background-color: inherit;
    border-color: transparent;
  }
`;

export const TabsPanel = styled(Tabs.Panel)`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
  height: 100%;
  padding: 1rem 2.5rem;
`;

export const TabWrapper = styled.div`
  // TODO: Maybe this isn't needed
  flex: 1;
`;

export const DataCachingSettingsMessage = styled.aside`
  max-width: 32rem;
  margin-bottom: 1rem;
`;
