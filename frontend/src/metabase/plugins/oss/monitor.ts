import type { ComponentType, ReactNode } from "react";

type MonitorPlugin = {
  isContentDiagnosticsEnabled: boolean;
  getContentDiagnosticsRoutes: () => ReactNode;
  isDependencyDiagnosticsEnabled: boolean;
  getDependencyDiagnosticsRoutes: () => ReactNode;
};

const getDefaultPluginMonitor = (): MonitorPlugin => ({
  isContentDiagnosticsEnabled: false,
  getContentDiagnosticsRoutes: () => null,
  isDependencyDiagnosticsEnabled: false,
  getDependencyDiagnosticsRoutes: () => null,
});

export const PLUGIN_MONITOR = getDefaultPluginMonitor();

const getDefaultMonitorTools = (): { COMPONENT: ComponentType | null } => ({
  COMPONENT: null,
});

export const PLUGIN_MONITOR_TOOLS: {
  COMPONENT: ComponentType | null;
} = getDefaultMonitorTools();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_MONITOR, getDefaultPluginMonitor());
  Object.assign(PLUGIN_MONITOR_TOOLS, getDefaultMonitorTools());
}
