import { getRegisteredComponent } from "metabase/viz-core";

import type { VisualizationComponent } from "./types/visualization";

/** Callers must render the returned component inside a Suspense boundary. */
export function getVisualizationComponent(
  ...args: Parameters<typeof getRegisteredComponent>
): VisualizationComponent | undefined {
  // Every chart in the registry was registered as a Visualization,
  // so its props are the ones this signature names.
  return getRegisteredComponent(...args) as VisualizationComponent | undefined;
}
