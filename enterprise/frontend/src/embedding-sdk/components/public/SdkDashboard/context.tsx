import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

import { addDefaultDashboardPluginValues } from "embedding-sdk/lib/plugins/dashboard";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { DashboardActionKey } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import type Question from "metabase-lib/v1/Question";

export type SdkDashboardContextType = Partial<{
  plugins: MetabasePluginsConfig;
  dashboardActions: DashboardActionKey[];
  onEditQuestion?: (question: Question) => void;
}>;
const SdkDashboardContext = createContext<SdkDashboardContextType>({});

export const SdkDashboardProvider = ({
  children,
  plugins,
  dashboardActions,
  onEditQuestion: initOnEditQuestion,
}: PropsWithChildren<SdkDashboardContextType>) => {
  const globalPlugins = useSdkSelector(getPlugins);

  const initializedPlugins = useMemo(() => {
    const combinedPlugins = { ...globalPlugins, ...plugins };

    return addDefaultDashboardPluginValues(combinedPlugins);
  }, [globalPlugins, plugins]);

  const onEditQuestion = useCallback(
    (question: Question) => initOnEditQuestion?.(question),
    [initOnEditQuestion],
  );

  const value = useMemo(
    () => ({
      plugins: initializedPlugins,
      dashboardActions,
      onEditQuestion,
    }),
    [dashboardActions, initializedPlugins, onEditQuestion],
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
