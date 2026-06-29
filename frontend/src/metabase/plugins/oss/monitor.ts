import type { ComponentType, ReactNode } from "react";

type MonitorPlugin = {
  isDependencyDiagnosticsEnabled: boolean;
  getDependencyDiagnosticsRoutes: () => ReactNode;
  isContentDiagnosticsEnabled: boolean;
  getContentDiagnosticsRoutes: () => ReactNode;
};

const getDefaultPluginMonitor = (): MonitorPlugin => ({
  isDependencyDiagnosticsEnabled: false,
  getDependencyDiagnosticsRoutes: () => null,
  isContentDiagnosticsEnabled: false,
  getContentDiagnosticsRoutes: () => null,
});

export const PLUGIN_MONITOR = getDefaultPluginMonitor();

const getDefaultMonitorTools = (): { COMPONENT: ComponentType | null } => ({
  COMPONENT: null,
});

/**
 * Erroring questions view, gated behind the `audit_app` premium feature. The EE
 * plugin sets `COMPONENT`; OSS leaves it null and falls back to an upsell.
 */
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
