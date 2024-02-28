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

import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { CacheConfigApi } from "metabase/services";
import { Tabs } from "metabase/ui";

import type {
  CacheConfig,
  Strategy,
  StrategySetter,
  GetConfigByModelId,
  CacheConfigFromAPI,
} from "../types";

import { Tab, TabContentWrapper, TabsList, TabsPanel } from "./CacheApp.styled";
import { Data } from "./Data";
enum TabId {
  DataCachingSettings = "dataCachingSettings",
  DashboardAndQuestionCaching = "dashboardAndQuestionCaching",
  ModelPersistence = "modelPersistence",
  CachingStats = "cachingStats",
}
const isValidTabId = (tab: unknown): tab is TabId =>
  typeof tab === "string" && Object.values(TabId).includes(tab as TabId);

export const CacheApp = () => {
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
    value: cacheConfigsFromApi,
    loading: areCacheConfigsLoading,
    error: errorWhenLoadingCacheConfigs,
  }: {
    value?: { items: CacheConfigFromAPI[] };
    loading: boolean;
    error?: any;
  } = useAsync(() => CacheConfigApi.list(), []);

  const [cacheConfigs, setCacheConfigs] = useState<CacheConfig[]>([]);

  useEffect(() => {
    // TODO: validate json
    if (cacheConfigsFromApi) {
      // TODO: The outgoing data and incoming data have slightly different
      // formats so we need to modify the data like this. Maybe it would be
      // good to iron this out.
      setCacheConfigs(
        cacheConfigsFromApi.items.map(item => ({
          ...item,
          // TODO: Remove this 'as Strategy' by introducing a complex validator
          strategy: { type: item.strategy, ...item.config } as Strategy,
        })),
      );
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

  const dbConfigs: GetConfigByModelId = useMemo(() => {
    const map: GetConfigByModelId = new Map();
    if (!map.has(0)) {
      map.set(0, { model: "root", model_id: 0, strategy: { type: "nocache" } });
    }
    cacheConfigs.forEach(config => {
      if (["root", "database"].includes(config.model)) {
        map.set(config.model_id, config);
      }
    });
    return map;
  }, [cacheConfigs]);

  const setStrategy = useCallback<StrategySetter>(
    async (databaseId, newStrategy) => {
      const baseConfig: Pick<CacheConfig, "model" | "model_id"> = {
        model: databaseId === 0 ? "root" : "database",
        model_id: databaseId,
      };
      const otherConfigs = cacheConfigs.filter(
        config => config.model_id !== databaseId,
      );
      if (newStrategy) {
        const existingConfig = cacheConfigs.find(
          config => config.model_id === databaseId,
        );
        const newConfig: CacheConfig = {
          ...baseConfig,
          strategy: {
            ...existingConfig?.strategy,
            // TODO: Move away from these two defaults
            ...newStrategy,
          } as Strategy, // TODO: Remove this 'as' which will be tricky
        };
        setCacheConfigs([...otherConfigs, newConfig]);
        await CacheConfigApi.update(newConfig);
      } else {
        setCacheConfigs(otherConfigs);
        await CacheConfigApi.delete(baseConfig);
      }
      // Re-fetch data from API at this point?
    },
    [cacheConfigs],
  );

  const clearDBOverrides = useCallback(() => {
    setCacheConfigs(configs =>
      configs.filter(({ model }) => model !== "database"),
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
            setStrategy={setStrategy}
            clearDBOverrides={clearDBOverrides}
          />
        </TabContentWrapper>
      </TabsPanel>
    </Tabs>
  );
};
