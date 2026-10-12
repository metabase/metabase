import type { ComponentType, ReactNode } from "react";

import { definePluginSlot } from "../slot";

type MonitorPlugin = {
  getContentDiagnosticsRoutes?: () => ReactNode;
  getDependencyDiagnosticsRoutes?: () => ReactNode;
  getSessionsRoutes?: () => ReactNode;
  getApiKeyUsageRoutes?: () => ReactNode;
};

const getDefaultPluginMonitor = (): MonitorPlugin => ({});

export const PLUGIN_MONITOR = definePluginSlot(getDefaultPluginMonitor);

const getDefaultMonitorTools = (): { COMPONENT: ComponentType | null } => ({
  COMPONENT: null,
});

export const PLUGIN_MONITOR_TOOLS: {
  COMPONENT: ComponentType | null;
} = definePluginSlot(getDefaultMonitorTools);
