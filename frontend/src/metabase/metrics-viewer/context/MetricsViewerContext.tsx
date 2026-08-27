import { type ReactNode, createContext, useContext } from "react";

import type { UseViewerStateResult } from "metabase/metrics-viewer/types";

const MetricsViewerContext = createContext<UseViewerStateResult | null>(null);

export function MetricsViewerProvider({
  value,
  children,
}: {
  value: UseViewerStateResult;
  children: ReactNode;
}) {
  return (
    <MetricsViewerContext.Provider value={value}>
      {children}
    </MetricsViewerContext.Provider>
  );
}

export function useMetricsViewerContext(): UseViewerStateResult {
  const context = useContext(MetricsViewerContext);
  if (!context) {
    throw new Error(
      "useMetricsViewerContext must be used within a MetricsViewerProvider",
    );
  }

  return context;
}
