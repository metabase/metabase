import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

// TODO: Add updateCacheConfigs, modeled on updateModelIndexes.
// Also look at some other examples of API interaction, since modelIndexes might not be the most representative case

import { useDatabaseListQuery } from "metabase/common/hooks";
import { useCacheConfigListQuery } from "metabase/common/hooks/use-cache-config-list-query/use-cache-config-list-query";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Tabs } from "metabase/ui";

import type { CacheConfig } from "../types";

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

export const Caching = () => {
  const [tabId, setTabId] = useState<TabId>(TabId.DataCachingSettings);
  const [tabsHeight, setTabsHeight] = useState<number>(300);
  const {
    data: databases = [],
    error: errorWhenLoadingDatabases,
    isLoading: areDatabasesLoading,
  } = useDatabaseListQuery();
  const {
    data: _cacheConfigsFromApi = [],
    error: errorWhenLoadingCacheConfigs,
    isLoading: areCacheConfigsLoading,
  } = useCacheConfigListQuery();

  // if (databases.length === 1) {
  //   databases.push(...databases);
  //   databases.push(...databases);
  //   databases.push(...databases);
  //   databases.push(...databases);
  // }

  const tabsRef = useRef<HTMLDivElement>(null);

  // TODO: Fetch cacheConfigs from the API
  const [cacheConfigs, setCacheConfigs] = useState<CacheConfig[]>([]);

  // TODO: extract out as a hook?
  // TODO: explain with a comment?
  useLayoutEffect(() => {
    const handleResize = () => {
      const tabs = tabsRef.current;
      if (!tabs) {
        return;
      }
      const tabsElementTop = tabs.getBoundingClientRect().top;
      const newHeight = window.innerHeight - tabsElementTop - tabs.clientTop;
      setTabsHeight(newHeight);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    setTimeout(handleResize, 50);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [tabsRef, areDatabasesLoading, areCacheConfigsLoading]);

  // TODO: instead of tabid, maybe just use a state variable whose type is Element? ah but value prop of Tabs has to be a string
  // "show don't tell"
  const dbConfigs = useMemo(() => {
    const map = new Map<number, CacheConfig>();
    // TODO: Get root strategy from api
    map.set(0, { modelType: "root", model_id: 0, strategy: "nocache" });
    cacheConfigs.forEach(config => {
      if (config.modelType === "database") {
        map.set(config.model_id, config);
      }
    });
    return map;
  }, [cacheConfigs]);

  const setDBConfig = useCallback(
    (databaseId: number, config: CacheConfig | null) => {
      const otherConfigs = cacheConfigs.filter(
        config => config.model_id !== databaseId,
      );
      setCacheConfigs(config ? [...otherConfigs, config] : otherConfigs);
    },
    [cacheConfigs],
  );

  const clearDBOverrides = useCallback(() => {
    setCacheConfigs(configs =>
      configs.filter(({ modelType }) => modelType !== "database"),
    );
  }, []);

  if (errorWhenLoadingDatabases || areDatabasesLoading) {
    return (
      <LoadingAndErrorWrapper
        error={errorWhenLoadingDatabases}
        loading={areDatabasesLoading}
      />
    );
  }

  if (errorWhenLoadingCacheConfigs || areCacheConfigsLoading) {
    return (
      <LoadingAndErrorWrapper
        error={errorWhenLoadingCacheConfigs}
        loading={areCacheConfigsLoading}
      />
    );
  }

  // TODO: The horizontal row of tabs does not look so good in narrow viewports
  return (
    <Tabs
      style={{ display: "flex", flexDirection: "column" }}
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
      </TabsList>
      <TabsPanel key={tabId} value={tabId}>
        <TabContentWrapper>
          <Data
            databases={databases}
            dbConfigs={dbConfigs}
            setDBConfig={setDBConfig}
            clearDBOverrides={clearDBOverrides}
          />
        </TabContentWrapper>
      </TabsPanel>
    </Tabs>
  );
};
