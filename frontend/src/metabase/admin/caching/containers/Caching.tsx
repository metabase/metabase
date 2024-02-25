import { useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Tabs } from "metabase/ui";

import type Database from "metabase-lib/metadata/Database";
import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Tab, TabContentWrapper, TabsList, TabsPanel } from "./Caching.styled";
import { Data } from "./Data";

enum TabId {
  DataCachingSettings = "dataCachingSettings",
  DashboardAndQuestionCaching = "dashboardAndQuestionCaching",
  ModelPersistence = "modelPersistence",
  CachingStats = "cachingStats",
}
const isValidTabId = (tab: unknown): tab is TabId =>
  typeof tab === "string" && Object.values(TabId).includes(tab as TabId);

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
  const [tabId, setTabId] = useState<TabId>(TabId.DataCachingSettings);
  const [tabsHeight, setTabsHeight] = useState<number>(300);
  const { data: databases = [], error, isLoading } = useDatabaseListQuery();

  const tabsRef = useRef<HTMLDivElement>(null);

  // TODO: Fetch cacheConfigs from the API
  const [cacheConfigs, setCacheConfigs] = useState<CacheConfig[]>([]);

  useLayoutEffect(() => {
    const handleResize = () => {
      const tabs = tabsRef.current;
      if (!tabs) return;
      const tabsElementTop = tabs.getBoundingClientRect().top;
      const newHeight =
        window.innerHeight - tabsElementTop - tabs.clientTop;
      setTabsHeight(newHeight);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    setTimeout(handleResize, 50);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [tabsRef.current, isLoading]);

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  // TODO: The horizontal row of tabs does not look so good in narrow viewports
  return (
    <Tabs
      style={{display: "flex", flexDirection: "column"}}
      ref={tabsRef}
      bg="bg-light"
      h={tabsHeight}
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
        <Tab key={"DataCachingSettings"} value={TabId.DataCachingSettings}>
          {t`Data caching settings`}
        </Tab>
        <Tab key={"ModelPersistence"} value={TabId.ModelPersistence}>
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
        <TabContentWrapper>
          <TabContent
            tabId={tabId}
            databases={databases}
            cacheConfigs={cacheConfigs}
          />
        </TabContentWrapper>
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
      // Ensure we've handled all cases
      const _exhaustiveCheck: never = tabId;
  }
  return null;
};
