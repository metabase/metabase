import { type ReactNode, createContext, useContext } from "react";

import type { UseMetricsViewerResult } from "metabase/metrics-viewer/hooks/use-metrics-viewer";

const MetricsViewerContext = createContext<UseMetricsViewerResult | null>(null);

export function MetricsViewerProvider({
  value,
  children,
}: {
  value: UseMetricsViewerResult;
  children: ReactNode;
}) {
  return (
    <MetricsViewerContext.Provider value={value}>
      {children}
    </MetricsViewerContext.Provider>
  );
}

export function useMetricsViewerContext(): UseMetricsViewerResult {
  const context = useContext(MetricsViewerContext);
  if (!context) {
    throw new Error(
      "useMetricsViewerContext must be used within a MetricsViewerProvider",
    );
  }

  return context;
}
