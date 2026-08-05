import type { ComponentType } from "react";
import { t } from "ttag";

import { isStorybookActive } from "metabase/env";
import type {
  DatasetData,
  IconName,
  VisualizationDisplay,
} from "metabase-types/api";

import type {
  Visualization,
  VisualizationDefinition,
} from "../types/visualization";

// The static-viz bundle registers bare definitions with no component; the app
// bundles register full components carrying their definition statics.
export type RegisteredVisualization = Visualization | VisualizationDefinition;

const visualizations = new Map<VisualizationDisplay, RegisteredVisualization>();
const aliases = new Map<string, RegisteredVisualization>();
const settingWidgets = new Map<string, ComponentType<any>>();
visualizations.get = function (key) {
  return (
    Map.prototype.get.call(this, key) ||
    aliases.get(key) ||
    defaultVisualization
  );
};

export function getSensibleDisplays(data: DatasetData) {
  return Array.from(visualizations)
    .filter(
      ([, viz]) =>
        // don't rule out displays if there's no data
        data.rows.length <= 1 || (viz.isSensible && viz.isSensible(data)),
    )
    .map(([display]) => display);
}

let defaultVisualization: RegisteredVisualization;
export function setDefaultVisualization(
  visualization: RegisteredVisualization,
) {
  defaultVisualization = visualization;
}

function isVisualizationComponent(
  visualization: RegisteredVisualization | undefined,
) {
  return typeof visualization === "function";
}

export function registerVisualization(visualization: RegisteredVisualization) {
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

export function getDefaultSize(display: VisualizationDisplay) {
  const visualization = visualizations.get(display);
  return visualization?.defaultSize;
}

// eslint-disable-next-line import/no-default-export
export default visualizations;
