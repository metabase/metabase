import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { Tabs } from "metabase/ui";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

enum CachingTabId {
  DataCachingSettings = "dataCachingSettings",
  DashboardAndQuestionCaching = "dashboardAndQuestionCaching",
  ModelPersistence = "modelPersistence",
  CachingStats = "cachingStats",
}
const isValidCachingTabId = (tab: unknown): tab is CachingTabId =>
  typeof tab === "string" && Object.values(CachingTabId).includes(tab as CachingTabId);

export const CachingTabsList = styled(Tabs.List)`
  padding: 0 2.5rem;
  background-color: ${color("white")};
  border-bottom-width: 1px;
`;

export const CachingTab = styled(Tabs.Tab)`
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

export const CachingTabsPanel = styled(Tabs.Panel)`
  display: flex;
  flex-flow: column nowrap;
  flex: 1;
  height: 100%;
  padding: 0 2.5rem;
`;

export const Caching = () => {
  const dispatch = useDispatch();
  const [tab, setTab] = useState<CachingTabId>(
    CachingTabId.DataCachingSettings,
  );
  return (
    <Tabs
      value={tab}
      onTabChange={value => {
        if (isValidCachingTabId(value)) {
          setTab(value);
          // perhaps later use: dispatch(push(`/admin/caching/${value}`));
          // or history.pushState to avoid reloading too much?
        } else {
          console.error("Invalid tab value", value);
        }
      }}
    >
      <CachingTabsList>
        <CachingTab
          key={"DataCachingSettings"}
          value={CachingTabId.DataCachingSettings}
        >
          {t`Data caching settings`}
        </CachingTab>
        <CachingTab
          key={"ModelPersistence"}
          value={CachingTabId.ModelPersistence}
        >
          {t`Model persistence`}
        </CachingTab>
        <CachingTab
          key={"DashboardAndQuestionCaching"}
          value={CachingTabId.DashboardAndQuestionCaching}
        >
          {t`Dashboard and question caching`}
        </CachingTab>
        <CachingTab key={"CachingStats"} value={CachingTabId.CachingStats}>
          {t`Caching stats`}
        </CachingTab>
      </CachingTabsList>
      <CachingTabsPanel key={tab} value={tab}>
        {tab === CachingTabId.DataCachingSettings && "data caching settings"}
        {tab === CachingTabId.ModelPersistence && "model persistence"}
        {tab === CachingTabId.DashboardAndQuestionCaching &&
          "dashboard and question caching"}
        {tab === CachingTabId.CachingStats && "caching stats"}
      </CachingTabsPanel>
    </Tabs>
  );
};
