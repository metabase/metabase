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

import {
  isValidStrategy,
  type CacheConfig,
  type CacheConfigFromAPI,
  type GetConfigByModelId,
  type Strategy,
  type StrategySetter,
  isValidConfigFromAPI,
  isValidCacheConfig,
  TabId,
  isValidTabId,
} from "../types";

import { Tab, TabContentWrapper, TabsList, TabsPanel } from "./CacheApp.styled";
import { DatabaseStrategyEditor } from "./Data";
const defaultRootStrategy: Strategy = { type: "nocache" };

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
      const configsForUI = configsFromAPI.map((config: unknown) =>
        normalizeConfigFromAPI(config),
      );
      setConfigs(configsForUI);
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
    configs.forEach(config => {
      if (config.model === "database") {
        map.set(config.model_id, config);
      }
    });
    return map;
  }, [configs]);

  const rootStrategy: Strategy = useMemo(() => {
    return (
      configs.find(config => config.model === "root")?.strategy ??
      defaultRootStrategy
    );
  }, [configs]);

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
      style={{ display: "flex", flexDirection: "column" }}
      ref={tabsRef}
      bg="bg-light"
      h={tabsHeight}
    >
      <TabsList>
        <Tab key={"DataCachingSettings"} value={TabId.DataCachingSettings}>
          {t`Data caching settings`}
        </Tab>
      </TabsList>
      <TabsPanel key={tabId} value={tabId}>
        <TabContentWrapper>
          <DatabaseStrategyEditor
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

const normalizeConfigFromAPI = (configFromAPI: unknown): CacheConfig => {
  if (!isValidConfigFromAPI(configFromAPI)) {
    throw new Error(`Invalid config retrieved from API: ${configFromAPI}`);
  }
  const strategy = { type: configFromAPI.strategy, ...configFromAPI.config };
  if (!isValidStrategy(strategy)) {
    throw new Error(`Invalid strategy retrieved from API: ${configFromAPI}`);
  }
  const config = {
    ...configFromAPI,
    strategy,
  };
  if (!isValidCacheConfig(config)) {
    throw new Error(`Invalid cache configuration: ${config}`);
  }
  return config;
};
