import { createContext, type PropsWithChildren, useContext } from "react";

import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import type Question from "metabase-lib/v1/Question";

type InteractiveDashboardContextType = Partial<{
  plugins: SdkPluginsConfig;
  onEditQuestion?: (question: Question) => void;
}>;

export const InteractiveDashboardContext =
  createContext<InteractiveDashboardContextType>({});

export const InteractiveDashboardProvider = ({
  children,
  plugins,
  onEditQuestion,
}: PropsWithChildren<InteractiveDashboardContextType>) => {
  return (
    <InteractiveDashboardContext.Provider
      value={{
        plugins,
        onEditQuestion,
      }}
    >
      {children}
    </InteractiveDashboardContext.Provider>
  );
};

export const useInteractiveDashboardContext = () => {
  return useContext(InteractiveDashboardContext);
};
