import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from "react";

import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { addDefaultDashboardPluginValues } from "embedding-sdk/lib/plugins/dashboard";
import type Question from "metabase-lib/v1/Question";

type InteractiveDashboardContextType = Partial<{
  plugins: SdkPluginsConfig;
  onEditQuestion?: (question: Question) => void;
}>;
const InteractiveDashboardContext =
  createContext<InteractiveDashboardContextType>({});

export const InteractiveDashboardProvider = ({
  children,
  plugins,
  onEditQuestion: initOnEditQuestion,
}: PropsWithChildren<InteractiveDashboardContextType>) => {
  const onEditQuestion = useCallback(
    (question: Question) => initOnEditQuestion?.(question),
    [initOnEditQuestion],
  );

  const initializedPlugins = useMemo(
    () => addDefaultDashboardPluginValues(plugins),
    [plugins],
  );

  const value = useMemo(
    () => ({
      plugins: initializedPlugins,
      onEditQuestion,
    }),
    [initializedPlugins, onEditQuestion],
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
