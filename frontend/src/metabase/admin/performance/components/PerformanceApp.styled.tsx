import styled from "@emotion/styled";

import { Tabs } from "metabase/ui";

import { PerformanceTabId } from "../types";

export const TabsList = styled(Tabs.List)`
  padding: 0 2.5rem;
  background-color: var(--mb-color-bg-light);
  border-bottom-width: 1px;
  margin-top: 1.5rem;
`;

export const Tab = styled(Tabs.Tab)`
  top: 1px;
  margin-bottom: 1px;
  border-bottom-width: 3px !important;
  padding: 0.625rem 0px;
  margin-inline-end: 1.25rem;
  :hover {
    color: var(--mb-color-brand);
    background-color: inherit;
    border-color: transparent;
  }
`;

export const TabsPanel = styled(Tabs.Panel)<{ value: string }>`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
  justify-content: stretch;
  padding: 1rem 2.5rem;
  ${props =>
    props.value === PerformanceTabId.DataCachingSettings && `overflow: hidden;`}
`;
