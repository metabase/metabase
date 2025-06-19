import {
  type PropsWithChildren,
  createContext,
  useContext,
  useMemo,
} from "react";

import { addDefaultDashboardPluginValues } from "embedding-sdk/lib/plugins/dashboard";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { DashboardActionKey } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import type Question from "metabase-lib/v1/Question";

export type InteractiveDashboardContextType = Partial<{
  plugins: MetabasePluginsConfig;
  dashboardActions: DashboardActionKey[];
  onEditQuestion: (question: Question) => void;
}>;
const InteractiveDashboardContext =
  createContext<InteractiveDashboardContextType>({});

export const InteractiveDashboardProvider = ({
  children,
  plugins,
  dashboardActions,
}: PropsWithChildren<InteractiveDashboardContextType>) => {
  const globalPlugins = useSdkSelector(getPlugins);

  const initializedPlugins = useMemo(() => {
    const combinedPlugins = { ...globalPlugins, ...plugins };

    return addDefaultDashboardPluginValues(combinedPlugins);
  }, [globalPlugins, plugins]);

  const value = useMemo(
    () => ({
      plugins: initializedPlugins,
      dashboardActions,
    }),
    [dashboardActions, initializedPlugins],
  );
  return (
    <InteractiveDashboardContext.Provider value={value}>
      {children}
    </InteractiveDashboardContext.Provider>
  );
};

export const useInteractiveDashboardContext = () => {
  return useContext(InteractiveDashboardContext);
};
