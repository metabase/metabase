import { type ReactNode, createContext, useContext } from "react";

import type { MetricDefinition } from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";

import type { CubeViewerActions } from "../hooks/use-cube-viewer-state";
import type { CardGenerator, CubeCatalog, CubeViewerState } from "../types";

export interface MetricCubeViewerContextValue {
  catalog: CubeCatalog;
  definitions: Map<MeasureId, MetricDefinition>;
  state: CubeViewerState;
  actions: CubeViewerActions;
  generator: CardGenerator;
}

const MetricCubeViewerContext =
  createContext<MetricCubeViewerContextValue | null>(null);

export function MetricCubeViewerProvider({
  value,
  children,
}: {
  value: MetricCubeViewerContextValue;
  children: ReactNode;
}) {
  return (
    <MetricCubeViewerContext.Provider value={value}>
      {children}
    </MetricCubeViewerContext.Provider>
  );
}

export function useMetricCubeViewerContext(): MetricCubeViewerContextValue {
  const context = useContext(MetricCubeViewerContext);
  if (!context) {
    throw new Error(
      "useMetricCubeViewerContext must be used within a MetricCubeViewerProvider",
    );
  }
  return context;
}
