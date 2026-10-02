import type { ComponentType, ReactNode } from "react";

import { definePluginSlot } from "../slot";

type MonitorPlugin = {
  isDependencyDiagnosticsEnabled: boolean;
  getDependencyDiagnosticsRoutes: () => ReactNode;
  isSessionManagementEnabled: boolean;
  getSessionManagementRoutes: () => ReactNode;
  isOAuthClientManagementEnabled: boolean;
  getOAuthClientManagementRoutes: () => ReactNode;
};

const getDefaultPluginMonitor = (): MonitorPlugin => ({
  isDependencyDiagnosticsEnabled: false,
  getDependencyDiagnosticsRoutes: () => null,
  isSessionManagementEnabled: false,
  getSessionManagementRoutes: () => null,
  isOAuthClientManagementEnabled: false,
  getOAuthClientManagementRoutes: () => null,
});

export const PLUGIN_MONITOR = definePluginSlot(getDefaultPluginMonitor);

const getDefaultMonitorTools = (): { COMPONENT: ComponentType | null } => ({
  COMPONENT: null,
});

export const PLUGIN_MONITOR_TOOLS: {
  COMPONENT: ComponentType | null;
} = definePluginSlot(getDefaultMonitorTools);
