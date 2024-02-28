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
  CacheConfigFromAPI,
  GetConfigByModelId,
  Strategy,
  StrategySetter,
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
  if (databases.length === 2) {
    databases.push(...databases);
    databases.push(...databases);
    databases.push(...databases);
    databases.push(...databases);
  }

  const {
    value: configsFromAPI,
    loading: areConfigsLoading,
    error: errorWhenLoadingConfigs,
  }: {
    value?: CacheConfigFromAPI[];
    loading: boolean;
    error?: any;
  } = useAsync(async () => {
    const [rootConfigsFromAPI, dbConfigsFromAPI] = await Promise.all([
      CacheConfigApi.list({ model: "root" }),
      CacheConfigApi.list({ model: "database" }),
    ]);
    const configs = [
      ...(rootConfigsFromAPI?.items ?? []),
      ...(dbConfigsFromAPI?.items ?? []),
    ];
    return configs;
  }, []);

  const [configs, setConfigs] = useState<CacheConfig[]>([]);

  useEffect(() => {
    // TODO: validate json
    if (configsFromAPI) {
      // TODO: The outgoing data and incoming data have slightly different
      // formats so we need to modify the data like this. It would be good to
      // iron this out.
      setConfigs(
        configsFromAPI.map(item => ({
          ...item,
          // TODO: Remove this 'as Strategy' by introducing a complex validator
          strategy: { type: item.strategy, ...item.config } as Strategy,
        })),
      );
    }
  }, [configsFromAPI]);

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
  }, [tabsRef, areDatabasesLoading, areConfigsLoading, areConfigsLoading]);

  const dbConfigs: GetConfigByModelId = useMemo(() => {
    const map: GetConfigByModelId = new Map();
    // Zero means the root strategy
    configs.forEach(config => {
      if (config.model === "database") {
        map.set(config.model_id, config);
      }
    });
    return map;
  }, [configs]);

  const rootStrategy: Strategy = useMemo(() => {
    return (
      configs.find(config => config.model === "root")?.strategy ?? {
        type: "nocache",
      }
    );
  }, [configs]);

  // TODO: Add model to this to make it general
  const setStrategy = useCallback<StrategySetter>(
    async (model, modelId, newStrategy) => {
      const baseConfig: Pick<CacheConfig, "model" | "model_id"> = {
        model,
        model_id: modelId,
      };
      const otherConfigs = configs.filter(
        config => config.model_id !== modelId,
      );
      if (newStrategy) {
        const existingConfig = configs.find(
          config => config.model_id === modelId,
        );
        const newConfig: CacheConfig = {
          ...baseConfig,
          strategy: {
            ...existingConfig?.strategy,
            // TODO: Move away from these two defaults
            ...newStrategy,
          } as Strategy, // TODO: Remove this 'as' which will be tricky
        };
        setConfigs([...otherConfigs, newConfig]);
        // TODO: What if the update fails? This might be over-engineering, but
        // maybe: always cache the previous state so we can roll back, and show
        // an error toast?
        await CacheConfigApi.update(newConfig);
      } else {
        setConfigs(otherConfigs);
        await CacheConfigApi.delete(baseConfig);
      }
      // Re-fetch data from API at this point?
    },
    [configs],
  );

  const clearDBOverrides = useCallback(() => {
    setConfigs(configs => configs.filter(({ model }) => model !== "database"));
  }, []);

  if (errorWhenLoadingConfigs || areConfigsLoading) {
    return (
      <LoadingAndErrorWrapper
        error={errorWhenLoadingConfigs}
        loading={areConfigsLoading}
      />
    );
  }

  if (errorWhenLoadingDatabases || areDatabasesLoading) {
    return (
      <LoadingAndErrorWrapper
        error={errorWhenLoadingDatabases}
        loading={areDatabasesLoading}
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
            rootStrategy={rootStrategy}
            setRootStrategy={strategy => setStrategy("root", 0, strategy)}
            setDBStrategy={(modelId, strategy) =>
              setStrategy("database", modelId, strategy)
            }
            clearDBOverrides={clearDBOverrides}
          />
        </TabContentWrapper>
      </TabsPanel>
    </Tabs>
  );
};
// TODO: Rename the 'Data' component
