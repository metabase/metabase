import type {
  CreateCustomVisualizationProps,
  CustomVisualizationSettingDefinition,
  ClickObject as CustomVizClickObject,
  HoverObject as CustomVizHoverObject,
} from "custom-viz";
import React from "react";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { useColorScheme } from "metabase/ui";
import visualizations, { registerVisualization } from "metabase/visualizations";
import { getCustomPluginIdentifier } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import type {
  Visualization,
  VisualizationProps,
} from "metabase/visualizations/types/visualization";
import { applyDefaultVisualizationProps } from "metabase-enterprise/custom_viz/custom-viz-common";
import { ensureVizApi } from "metabase-enterprise/custom_viz/custom-viz-globals";

/**
 * Mirror of `loadCustomVizPlugin` from
 * enterprise/frontend/src/metabase-enterprise/custom_viz/custom-viz-plugins.ts,
 * but with the HTTP source pointing at a Storybook static-dir URL instead of
 * the Metabase plugin bundle API. Lets Storybook stories (and Loki) exercise
 * the real UMD-eval + wrapping flow without needing a backend.
 */
export type StorybookCustomVizPlugin = {
  bundleUrl: string;
  displayName: string;
  identifier: string;
  iconUrl?: string;
  assetBaseUrl?: string;
};

export async function registerCustomVizPluginForStorybook(
  plugin: StorybookCustomVizPlugin,
): Promise<string> {
  ensureVizApi();

  const res = await fetch(plugin.bundleUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch plugin bundle (${plugin.bundleUrl}): HTTP ${res.status}`,
    );
  }
  const text = await res.text();

  const script = document.createElement("script");
  script.textContent = text;
  document.head.appendChild(script);
  document.head.removeChild(script);

  const factory = window.__customVizPlugin__;
  window.__customVizPlugin__ = undefined;
  if (typeof factory !== "function") {
    throw new Error(
      "Plugin bundle did not assign a factory to window.__customVizPlugin__",
    );
  }

  const props: CreateCustomVisualizationProps<Record<string, unknown>> = {
    defineSetting(definition) {
      return definition as unknown as CustomVisualizationSettingDefinition<
        Record<string, unknown>
      >;
    },
    getAssetUrl(path: string) {
      return plugin.assetBaseUrl ? `${plugin.assetBaseUrl}/${path}` : path;
    },
    locale: "en",
  };

  const vizDef = factory(props);
  if (!vizDef?.VisualizationComponent) {
    throw new Error(
      "Plugin factory did not return an object with a VisualizationComponent",
    );
  }

  const identifier = getCustomPluginIdentifier(plugin.identifier);

  const Wrapper = ({
    onVisualizationClick,
    onHoverChange,
    ...rest
  }: Omit<VisualizationProps, "width" | "height"> & {
    width: number | null;
    height: number | null;
  }) => {
    const { resolvedColorScheme } = useColorScheme();
    return React.createElement(vizDef.VisualizationComponent, {
      ...rest,
      colorScheme: resolvedColorScheme,
      onClick: onVisualizationClick as unknown as (
        clickObject: CustomVizClickObject<Record<string, unknown>> | null,
      ) => void,
      onHover: onHoverChange as unknown as (
        hoverObject?: CustomVizHoverObject | null,
      ) => void,
    });
  };

  const Component = ExplicitSize<VisualizationProps>({ wrapped: true })(
    Wrapper,
  ) as Visualization;
  applyDefaultVisualizationProps(Component, vizDef, {
    identifier,
    getUiName: () => plugin.displayName,
    iconUrl: plugin.iconUrl,
    isDev: false,
  });

  if (visualizations.has(identifier)) {
    visualizations.set(identifier, Component);
  } else {
    registerVisualization(Component);
  }

  return identifier;
}
