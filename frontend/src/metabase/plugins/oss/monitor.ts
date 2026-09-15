import type { ComponentType, ReactNode } from "react";

import { definePluginSlot } from "../slot";

type MonitorPlugin = {
  isDependencyDiagnosticsEnabled: boolean;
  getDependencyDiagnosticsRoutes: () => ReactNode;
  isSessionManagementEnabled: boolean;
  getSessionManagementRoutes: () => ReactNode;
};

const getDefaultPluginMonitor = (): MonitorPlugin => ({
  isDependencyDiagnosticsEnabled: false,
  getDependencyDiagnosticsRoutes: () => null,
  isSessionManagementEnabled: false,
  getSessionManagementRoutes: () => null,
});

export const PLUGIN_MONITOR = definePluginSlot(getDefaultPluginMonitor);

const getDefaultMonitorTools = (): { COMPONENT: ComponentType | null } => ({
  COMPONENT: null,
});

export const PLUGIN_MONITOR_TOOLS: {
  COMPONENT: ComponentType | null;
} = definePluginSlot(getDefaultMonitorTools);
