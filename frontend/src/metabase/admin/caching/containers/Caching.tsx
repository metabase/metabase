import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

// TODO: Add updateCacheConfigs, modeled on updateModelIndexes.
// Also look at some other examples of API interaction, since modelIndexes might not be the most representative case

import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { CacheConfigApi } from "metabase/services";
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
  const tabsRef = useRef<HTMLDivElement>(null);

  const {
    data: databases = [],
    error: errorWhenLoadingDatabases,
    isLoading: areDatabasesLoading,
  } = useDatabaseListQuery();

  // add some dummy data
  if (databases.length === 1) {
    databases.push(...databases);
    databases.push(...databases);
    databases.push(...databases);
    databases.push(...databases);
  }

  const {
    loading: areCacheConfigsLoading,
    value: cacheConfigsFromApi,
    error: errorWhenLoadingCacheConfigs,
  } = useAsync(() => CacheConfigApi.list(), []);

  const [cacheConfigs, setCacheConfigs] = useState<CacheConfig[]>([]);

  useEffect(() => {
    // TODO: validate json
    if (cacheConfigsFromApi) {
      setCacheConfigs(cacheConfigsFromApi.items);
    }
  }, [cacheConfigsFromApi]);

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
      if (config) {
        CacheConfigApi.update({
          model: databaseId === 0 ? "root" : "database",
          model_id: databaseId,
          strategy: { type: "nocache" }, // config.strategy },
        });
      } else {
        CacheConfigApi.delete({
          model: databaseId === 0 ? "root" : "database",
          model_id: databaseId,
        });
      }
      // Re-fetch data from API at this point?
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
