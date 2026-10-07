import { type ComponentType, lazy } from "react";
import { isValidElementType } from "react-is";
import { t } from "ttag";
import _ from "underscore";

import { isStorybookActive } from "metabase/env";
import { retry } from "metabase/utils/retry";
import type {
  IconName,
  RawSeries,
  TransformedSeries,
  VisualizationDisplay,
} from "metabase-types/api";

import type { VisualizationDefinition } from "../types/definition";

// A chart component carrying its definition as statics.
// The props stay open because static-viz loads the registry without the React and redux types.
export type RegisteredVisualizationComponent = ComponentType<any> &
  VisualizationDefinition;

// The static-viz bundle registers bare definitions with no component; the app
// bundles register full components carrying their definition statics.
export type RegisteredVisualization =
  | RegisteredVisualizationComponent
  | VisualizationDefinition;

// A definition can be registered together with a loader for its component, so
// the chart itself stays out of the initial bundle. The loaded module carries
// its definition statics, the same as an eagerly registered visualization.
export type VisualizationComponentLoader =
  () => Promise<RegisteredVisualizationComponent>;

export const visualizations = new Map<
  VisualizationDisplay,
  RegisteredVisualization
>();
const aliases = new Map<string, RegisteredVisualization>();
const settingWidgets = new Map<string, ComponentType<any>>();
const componentLoaders = new Map<
  VisualizationDisplay,
  VisualizationComponentLoader
>();
const lazyComponents = new Map<VisualizationDisplay, ComponentType<any>>();
visualizations.get = function (key) {
  return (
    Map.prototype.get.call(this, key) ||
    aliases.get(key) ||
    defaultVisualization
  );
};

let defaultVisualization: RegisteredVisualization;
export function setDefaultVisualization(
  visualization: RegisteredVisualization,
) {
  defaultVisualization = visualization;
}

// A component is a function, a class, or one of the exotic objects that memo,
// forwardRef and lazy return. A bare definition is a plain object.
function isVisualizationComponent(
  visualization: RegisteredVisualization | undefined,
): visualization is RegisteredVisualizationComponent {
  return isValidElementType(visualization);
}

export function registerVisualization(
  visualization: RegisteredVisualization,
  loadComponent?: VisualizationComponentLoader,
) {
  if (visualization == null) {
    throw new Error(t`Visualization is null`);
  }
  const identifier = visualization.identifier;
  if (identifier == null) {
    throw new Error(
      t`Visualization must define an 'identifier' static variable: ` +
        visualization.name,
    );
  }
  // Record the loader before the checks below, which return early when this
  // identifier is already registered. Both registries are one module in
  // Storybook, where static-viz registers the bare definitions first.
  if (loadComponent) {
    componentLoaders.set(identifier, loadComponent);
  }
  if (visualizations.has(identifier)) {
    const registeredVisualization = visualizations.get(identifier);
    const isReplacingDefinitionWithComponent =
      isVisualizationComponent(visualization) &&
      !isVisualizationComponent(registeredVisualization);
    const isRegisteringDefinitionOverComponent =
      !isVisualizationComponent(visualization) &&
      isVisualizationComponent(registeredVisualization);

    if (isRegisteringDefinitionOverComponent) {
      return;
    }

    if (!isReplacingDefinitionWithComponent) {
      if (isStorybookActive) {
        console.error(
          `Visualization with that identifier is already registered: ` +
            visualization.name,
        );

        // do not throw if it's storybook
        return;
      }

      throw new Error(
        t`Visualization with that identifier is already registered: ` +
          visualization.name,
      );
    }
  }
  visualizations.set(identifier, visualization);
  for (const alias of visualization.aliases || []) {
    aliases.set(alias, visualization);
  }
}

/**
 * The component that renders a display type, wrapped in `lazy` when the
 * definition was registered with a loader. Callers must render it inside a
 * Suspense boundary.
 */
export function getRegisteredComponent(
  display: VisualizationDisplay | null,
): ComponentType<any> | undefined {
  const visualization = getVisualization(display);

  if (visualization == null) {
    return undefined;
  }

  if (isVisualizationComponent(visualization)) {
    return visualization;
  }

  const { identifier } = visualization;
  const cachedComponent = lazyComponents.get(identifier);
  if (cachedComponent) {
    return cachedComponent;
  }

  const loadComponent = componentLoaders.get(identifier);
  if (!loadComponent) {
    return undefined;
  }

  const component = lazy(() =>
    retry(loadComponent, {
      maxRetries: 2,
      shouldRetry: () => true,
      delayMs: (attempt) => 300 * 2 ** attempt,
    })
      .then((Chart) => ({ default: Chart }))
      .catch((error) => {
        // React keeps a rejected lazy rejected for the life of the object, so
        // reusing this one would fail every later render until a reload. Drop
        // it and the next render builds one that downloads again.
        lazyComponents.delete(identifier);
        throw error;
      }),
  );
  lazyComponents.set(identifier, component);
  return component;
}

/**
 * Start downloading a chart's chunk before it is rendered, typically while its
 * data query is still in flight, so the chunk loads in parallel with the data.
 * The bundler de-duplicates the request with the one `lazy` makes.
 */
export function prefetchVisualizationComponent(
  display: VisualizationDisplay | null,
) {
  const visualization = getVisualization(display);

  if (visualization != null && !isVisualizationComponent(visualization)) {
    // A prefetch failure is not worth surfacing: the render path downloads the
    // chunk again and reports the error there if it still fails.
    componentLoaders
      .get(visualization.identifier)?.()
      .catch(() => undefined);
  }
}

/**
 * Load chart components and register them in place of their definitions, so
 * charts render in one pass. Awaiting the loaders is not enough on its own:
 * `lazy` suspends on its first render even when the module is already in
 * memory, which a visual regression test captures as the fallback.
 *
 * Defaults to every registered chart. Tests should name the displays they
 * render, so a spec does not pay to load the other twenty.
 */
export async function loadVisualizationComponents(
  displays?: VisualizationDisplay[],
): Promise<void> {
  const wanted = displays
    ? displays.map((display) => getVisualization(display)?.identifier)
    : Array.from(componentLoaders.keys());

  await Promise.all(
    wanted.map(async (identifier) => {
      if (
        identifier == null ||
        isVisualizationComponent(visualizations.get(identifier))
      ) {
        return;
      }
      const loadComponent = componentLoaders.get(identifier);
      if (!loadComponent) {
        return;
      }
      try {
        registerVisualization(await loadComponent());
      } catch {
        // One chart that fails to load should not stop the rest. It stays
        // lazy, and the render path reports the failure.
      }
    }),
  );
}

export function registerSettingWidgets(
  widgets: Record<string, ComponentType<any>>,
) {
  for (const [key, widget] of Object.entries(widgets)) {
    settingWidgets.set(key, widget);
  }
}

export function getSettingWidgetComponent(key: string) {
  return settingWidgets.get(key);
}

type SeriesLike = Array<{ card: { display: VisualizationDisplay } }>;

export function getVisualization(display: VisualizationDisplay | null) {
  return display ? visualizations.get(display) : defaultVisualization;
}

export function getVisualizationRaw(
  series: SeriesLike,
): RegisteredVisualization | undefined {
  return visualizations.get(series[0].card.display);
}

export function getIconForVisualizationType(display: VisualizationDisplay): {
  name: IconName;
  iconUrl?: string;
} {
  const viz = visualizations.get(display);
  return {
    name: viz?.iconName ?? "unknown",
    iconUrl: viz?.iconUrl,
  };
}

export function getMaxMetricsSupported(display: VisualizationDisplay) {
  const visualization = visualizations.get(display);
  return visualization?.maxMetricsSupported || Infinity;
}

export function getMaxDimensionsSupported(display: VisualizationDisplay) {
  const visualization = visualizations.get(display);
  return visualization?.maxDimensionsSupported || 2;
}

export function canSavePng(display: VisualizationDisplay) {
  const visualization = visualizations.get(display);
  return visualization?.canSavePng ?? true;
}

export function getRegisteredDefaultSize(display: VisualizationDisplay) {
  const visualization = visualizations.get(display);
  return visualization?.defaultSize;
}

export function getVisualizationTransformed(
  series: RawSeries | TransformedSeries,
) {
  // don't transform if we don't have the data
  if (
    _.any(series, (s) => s.data == null) ||
    _.any(series, (s) => s.error != null)
  ) {
    return {
      series,
      visualization: getVisualizationRaw(series),
    };
  }

  // if a visualization has a transformSeries function, do the transformation until it returns the same visualization / series
  let visualization, lastSeries;
  do {
    visualization = visualizations.get(series[0].card.display);
    if (!visualization) {
      throw new Error(t`No visualization for ${series[0].card.display}`);
    }
    lastSeries = series;
    if (typeof visualization.transformSeries === "function") {
      series = visualization.transformSeries(series);
    }
    if (series !== lastSeries) {
      series = Object.assign([...series], { _raw: lastSeries });
    }
  } while (series !== lastSeries);

  return { series, visualization };
}

export function isCartesianChart(display: VisualizationDisplay) {
  const visualization = visualizations.get(display);
  const settingNames = Object.keys(visualization?.settings ?? {});
  return (
    settingNames.includes("graph.dimensions") &&
    settingNames.includes("graph.metrics")
  );
}
