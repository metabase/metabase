import type { ComponentType, ReactNode } from "react";

import { definePluginSlot } from "../slot";

type MonitorPlugin = {
  isContentDiagnosticsEnabled: boolean;
  getContentDiagnosticsRoutes: () => ReactNode;
  isDependencyDiagnosticsEnabled: boolean;
  getDependencyDiagnosticsRoutes: () => ReactNode;
  isSessionManagementEnabled: boolean;
  getSessionManagementRoutes: () => ReactNode;
  isApiKeyUsageEnabled: boolean;
  getApiKeyUsageRoutes: () => ReactNode;
};

const getDefaultPluginMonitor = (): MonitorPlugin => ({
  isContentDiagnosticsEnabled: false,
  getContentDiagnosticsRoutes: () => null,
  isDependencyDiagnosticsEnabled: false,
  getDependencyDiagnosticsRoutes: () => null,
  isSessionManagementEnabled: false,
  getSessionManagementRoutes: () => null,
  isApiKeyUsageEnabled: false,
  getApiKeyUsageRoutes: () => null,
});

export const PLUGIN_MONITOR = definePluginSlot(getDefaultPluginMonitor);

const getDefaultMonitorTools = (): { COMPONENT: ComponentType | null } => ({
  COMPONENT: null,
});

export const PLUGIN_MONITOR_TOOLS: {
  COMPONENT: ComponentType | null;
} = definePluginSlot(getDefaultMonitorTools);
