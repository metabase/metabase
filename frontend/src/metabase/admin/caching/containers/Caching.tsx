import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Tabs } from "metabase/ui";

import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import type { CacheConfig } from "../types";
import { Tab, TabContentWrapper, TabsList, TabsPanel } from "./Caching.styled";
import { Data } from "./Data";
import type Database from "metabase-lib/metadata/Database";

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
  const { data: databases = [], error, isLoading } = useDatabaseListQuery();

  if (databases.length === 1) {
    databases.push({ ...databases[0], id: 2, name: t`Database 2` } as Database);
    databases.push({ ...databases[0], id: 3, name: t`Database 3` } as Database);
    databases.push({ ...databases[0], id: 4, name: t`Database 4` } as Database);
    databases.push({ ...databases[0], id: 5, name: t`Database 5` } as Database);
    databases.push({ ...databases[0], id: 6, name: t`Database 6` } as Database);
    databases.push({ ...databases[0], id: 7, name: t`Database 7` } as Database);
    databases.push({ ...databases[0], id: 8, name: t`Database 8` } as Database);
    databases.push({ ...databases[0], id: 9, name: t`Database 9` } as Database);
    databases.push({ ...databases[0], id: 10, name: t`Database 10` } as Database);
    databases.push({ ...databases[0], id: 11, name: t`Database 11` } as Database);
  }

  const tabsRef = useRef<HTMLDivElement>(null);

  // TODO: Fetch cacheConfigs from the API
  const [cacheConfigs, setCacheConfigs] = useState<CacheConfig[]>([]);

  // TODO: extract out as a hook?
  // TODO: explain with a comment?
  useLayoutEffect(() => {
    const handleResize = () => {
      const tabs = tabsRef.current;
      if (!tabs) return;
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
  }, [tabsRef.current, isLoading]);

  // TODO: instead of tabid, maybe just use a state variable whose type is Element? ah but value prop of Tabs has to be a string
  // "show don't tell"
  const databaseConfigurations = useMemo(() => {
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

  const setDatabaseConfiguration = useCallback(
    (databaseId: number, config: CacheConfig | null) => {
      // TODO: perhaps clear all overrides is not working because of how otherConfigs is working
      const otherConfigs = cacheConfigs.filter(
        config => config.model_id !== databaseId,
      );
      if (config) {
        setCacheConfigs([...otherConfigs, config]);
      } else {
        setCacheConfigs(otherConfigs);
      }
    },
    [cacheConfigs],
  );

  const clearAllDatabaseOverrides = useCallback(() => {
    setCacheConfigs(configs =>
      configs.filter(({ modelType }) => modelType !== "database"),
    );
  }, [cacheConfigs]);

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
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
            databaseConfigurations={databaseConfigurations}
            setDatabaseConfiguration={setDatabaseConfiguration}
            clearAllDatabaseOverrides={clearAllDatabaseOverrides}
          />
        </TabContentWrapper>
      </TabsPanel>
    </Tabs>
  );
};
