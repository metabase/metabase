import { useState } from "react";
import { t } from "ttag";

import { Tabs } from "metabase/ui";

import {
  CachingTab,
  CachingTabContent,
  CachingTabsList,
  CachingTabsPanel,
} from "./Caching.styled";
import { DataCachingSettings } from "./DataCachingSettings";

enum CachingTabId {
  DataCachingSettings = "dataCachingSettings",
  DashboardAndQuestionCaching = "dashboardAndQuestionCaching",
  ModelPersistence = "modelPersistence",
  CachingStats = "cachingStats",
}
const isValidCachingTabId = (tab: unknown): tab is CachingTabId =>
  typeof tab === "string" &&
  Object.values(CachingTabId).includes(tab as CachingTabId);

export const Caching = () => {
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
        <CachingTabContent>
          {tab === CachingTabId.DataCachingSettings && <DataCachingSettings />}
          {tab === CachingTabId.ModelPersistence && "model persistence"}
          {tab === CachingTabId.DashboardAndQuestionCaching &&
            "dashboard and question caching"}
          {tab === CachingTabId.CachingStats && "caching stats"}
        </CachingTabContent>
      </CachingTabsPanel>
    </Tabs>
  );
};
