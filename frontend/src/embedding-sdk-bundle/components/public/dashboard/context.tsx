import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

import { addDefaultDashboardPluginValues } from "embedding-sdk-bundle/lib/plugins/dashboard";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getPlugins } from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type Question from "metabase-lib/v1/Question";

export type SdkDashboardContextType = Partial<{
  plugins: MetabasePluginsConfig;
  onEditQuestion: (question: Question) => void;
}>;
const SdkDashboardContext = createContext<SdkDashboardContextType>({});

export const SdkDashboardProvider = ({
  children,
  plugins,
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
      onEditQuestion,
    }),
    [initializedPlugins, onEditQuestion],
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
