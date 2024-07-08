import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
} from "react";

import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { initializePlugins } from "embedding-sdk/lib/plugins/initialize";
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
  onEditQuestion,
}: PropsWithChildren<InteractiveDashboardContextType>) => {
  const value = useMemo(
    () => ({
      plugins: initializePlugins(plugins),
      onEditQuestion,
    }),
    [onEditQuestion, plugins],
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
