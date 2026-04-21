import {
  type PropsWithChildren,
  createContext,
  useContext,
  useMemo,
} from "react";

import { addDefaultDashboardPluginValues } from "embedding-sdk-bundle/lib/plugins/dashboard";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getPlugins } from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "metabase/embedding/sdk-bundle/types/plugins";

export type SdkDashboardContextType = Partial<{
  plugins: MetabasePluginsConfig;
}>;
const SdkDashboardContext = createContext<SdkDashboardContextType>({});

export const SdkDashboardProvider = ({
  children,
  plugins,
}: PropsWithChildren<SdkDashboardContextType>) => {
  const globalPlugins = useSdkSelector(getPlugins);

  const initializedPlugins = useMemo(() => {
    const combinedPlugins = { ...globalPlugins, ...plugins };

    return addDefaultDashboardPluginValues(combinedPlugins);
  }, [globalPlugins, plugins]);

  const value = useMemo(
    () => ({
      plugins: initializedPlugins,
    }),
    [initializedPlugins],
  );
  return (
    <SdkDashboardContext.Provider value={value}>
      {children}
    </SdkDashboardContext.Provider>
  );
};

export const useSdkDashboardContext = () => {
  return useContext(SdkDashboardContext);
};
