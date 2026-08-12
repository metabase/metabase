import { c, t } from "ttag";

import type {
  CustomVizPluginId,
  CustomVizPluginRuntime,
} from "metabase-types/api";

import type { LoadCustomVizPluginOptions } from "../custom-viz-plugins";

const FLUSH_DELAY_MS = 300;

const pendingPlugins = new Map<CustomVizPluginId, CustomVizPluginRuntime>();
let latestOnInfo: LoadCustomVizPluginOptions["onInfo"] | undefined;
let flushTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Collects unavailable plugin reports over a short window and shows them as a single toast.
 */
export function reportUnavailableCustomVizPlugin(
  plugin: CustomVizPluginRuntime,
  onInfo?: LoadCustomVizPluginOptions["onInfo"],
) {
  pendingPlugins.set(plugin.id, plugin);
  latestOnInfo = onInfo;

  if (!latestOnInfo) {
    return;
  }

  if (flushTimeoutId != null) {
    clearTimeout(flushTimeoutId);
  }

  flushTimeoutId = setTimeout(
    flushUnavailableCustomVizPluginReports,
    FLUSH_DELAY_MS,
  );
}

export function resetUnavailableCustomVizPluginReports() {
  pendingPlugins.clear();
  latestOnInfo = undefined;

  if (flushTimeoutId != null) {
    clearTimeout(flushTimeoutId);
    flushTimeoutId = null;
  }
}

function flushUnavailableCustomVizPluginReports() {
  const plugins = [...pendingPlugins.values()];
  const onInfo = latestOnInfo;

  resetUnavailableCustomVizPluginReports();

  if (plugins.length > 0 && onInfo) {
    onInfo(getUnavailableMessage(plugins));
  }
}

function getUnavailableMessage(plugins: CustomVizPluginRuntime[]) {
  return plugins.length === 1
    ? getSingularMessage(plugins[0])
    : getPluralMessage(plugins);
}

function getSingularMessage({
  display_name,
  warnings,
}: CustomVizPluginRuntime) {
  return warnings.length > 0
    ? t`The "${display_name}" visualization is currently unavailable. It was built for a different version and may need to be updated.`
    : t`The "${display_name}" visualization is currently unavailable.`;
}

function getPluralMessage(plugins: CustomVizPluginRuntime[]) {
  const names = plugins
    .map(({ display_name }) => display_name)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `"${name}"`)
    .join(", ");
  const message = c(
    "{0} is the number of visualizations, {1} is a comma-separated list of their names",
  ).t`${plugins.length} visualizations are currently unavailable: ${names}.`;

  const hasAnyWarnings = plugins.some(({ warnings }) => warnings.length > 0);
  return hasAnyWarnings
    ? `${message} ${t`They may have been built for a different version and may need to be updated.`}`
    : message;
}
