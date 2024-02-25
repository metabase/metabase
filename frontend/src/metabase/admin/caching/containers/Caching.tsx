import { useState } from "react";
import { t } from "ttag";

import { Tabs } from "metabase/ui";

import { Tab, TabWrapper, TabsList, TabsPanel } from "./Caching.styled";
import { Data } from "./Data";
import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import type Database from "metabase-lib/metadata/Database";

enum TabId {
  DataCachingSettings = "dataCachingSettings",
  DashboardAndQuestionCaching = "dashboardAndQuestionCaching",
  ModelPersistence = "modelPersistence",
  CachingStats = "cachingStats",
}
const isValidTabId = (tab: unknown): tab is TabId =>
  typeof tab === "string" &&
  Object.values(TabId).includes(tab as TabId);

export type CacheStrategy =
  | "nocache"
  | "ttl"
  | "duration"
  | "schedule"
  | "query";
export type CacheConfigUnit = "hours" | "minutes" | "seconds" | "days";
export type CacheModel =
  | "root"
  | "database"
  | "collection"
  | "dashboard"
  | "question";

// TODO: I'm guessing this from caching/strategies.clj
export type CacheConfig = {
  model: CacheModel;
  model_id: number;
  strategy: CacheStrategy;
  config: {
    type?: string;
    updated_at?: string;
    multiplier?: number;
    payload?: string;
    min_duration?: number;
    unit?: CacheConfigUnit;
    schedule?: string;
    field_id?: string;
    aggregation?: string;
  };
};

export const Caching = () => {
  const [tabId, setTabId] = useState<TabId>(
    TabId.DataCachingSettings,
  );

  const { data: databases = [], error, isLoading } = useDatabaseListQuery();

  // TODO: Fetch cacheConfigs from the API
  const [cacheConfigs, setCacheConfigs] = useState<CacheConfig[]>([]);

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  // TODO: The horizontal row of tabs does not look so good in narrow viewports
  return (
    <Tabs
      value={tabId}
      onTabChange={value => {
        if (isValidTabId(value)) {
          setTabId(value);
          // perhaps later use: dispatch(push(`/admin/caching/${value}`));
          // or history.pushState to avoid reloading too much?
        } else {
          console.error("Invalid tab value", value);
        }
      }}
    >
      <TabsList>
        <Tab
          key={"DataCachingSettings"}
          value={TabId.DataCachingSettings}
        >
          {t`Data caching settings`}
        </Tab>
        <Tab
          key={"ModelPersistence"}
          value={TabId.ModelPersistence}
        >
          {t`Model persistence`}
        </Tab>
        <Tab
          key={"DashboardAndQuestionCaching"}
          value={TabId.DashboardAndQuestionCaching}
        >
          {t`Dashboard and question caching`}
        </Tab>
        <Tab key={"CachingStats"} value={TabId.CachingStats}>
          {t`Caching stats`}
        </Tab>
      </TabsList>
      <TabsPanel key={tabId} value={tabId}>
        <TabWrapper>
          <TabContent
            tabId={tabId}
            databases={databases}
            cacheConfigs={cacheConfigs}
          />
        </TabWrapper>
      </TabsPanel>
    </Tabs>
  );
};

const TabContent = ({
  tabId,
  databases,
  cacheConfigs,
}: {
  tabId: TabId;
  databases: Database[];
  cacheConfigs: CacheConfig[];
}) => {
  switch (tabId) {
    case TabId.DataCachingSettings:
      return <Data databases={databases} cacheConfigs={cacheConfigs} />;
    case TabId.ModelPersistence:
      return <>model persistence</>;
    case TabId.DashboardAndQuestionCaching:
      return <>dashboard and question caching</>;
    case TabId.CachingStats:
      return <>caching stats</>;
    default:
      const _exhaustiveCheck: never = tabId;
  }
};
