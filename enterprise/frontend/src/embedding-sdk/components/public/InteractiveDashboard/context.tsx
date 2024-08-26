import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { addDefaultDashboardPluginValues } from "embedding-sdk/lib/plugins/dashboard";
import { useSdkSelector } from "embedding-sdk/store";
import { getPlugins } from "embedding-sdk/store/selectors";
import type { DashboardActionKey } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import type Question from "metabase-lib/v1/Question";

type InteractiveDashboardContextType = Partial<{
  plugins: SdkPluginsConfig;
  dashboardActions: DashboardActionKey[];
  onEditQuestion?: (question: Question) => void;
}>;
const InteractiveDashboardContext =
  createContext<InteractiveDashboardContextType>({});

export const InteractiveDashboardProvider = ({
  children,
  plugins,
  dashboardActions,
  onEditQuestion: initOnEditQuestion,
}: PropsWithChildren<InteractiveDashboardContextType>) => {
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
    <InteractiveDashboardContext.Provider value={value}>
      {children}
    </InteractiveDashboardContext.Provider>
  );
};

export const useInteractiveDashboardContext = () => {
  return useContext(InteractiveDashboardContext);
};
