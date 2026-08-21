import { getRegisteredComponent } from "./lib/registry";
import type { VisualizationComponent } from "./types/visualization";

/**
 * The component that renders a display type, typed against the props the app
 * passes it. Callers must render it inside a Suspense boundary.
 */
export function getVisualizationComponent(
  ...args: Parameters<typeof getRegisteredComponent>
): VisualizationComponent | undefined {
  // The registry types its components with open props, because it is also
  // loaded by static-viz, which does not have the app's prop types. Every
  // chart it holds was registered as a Visualization, so the props are the
  // ones this signature names.
  return getRegisteredComponent(...args) as VisualizationComponent | undefined;
}
