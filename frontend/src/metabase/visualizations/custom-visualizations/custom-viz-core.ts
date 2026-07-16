import type {
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";

// Dependency-light custom-viz helpers, split from ./custom-viz-utils so the
// static-viz bundles can use them without pulling that module's heavy imports
// (metabase/urls drags in metabase-lib and the cljs MLv2 stack).

export function getCustomPluginIdentifier(
  pluginOrIdentifier: Pick<CustomVizPluginRuntime, "identifier"> | string,
): VisualizationDisplay {
  const identifier =
    typeof pluginOrIdentifier === "string"
      ? pluginOrIdentifier
      : pluginOrIdentifier.identifier;

  return `custom:${identifier}`;
}

export const defineSetting = <T>(definition: T) => definition;
