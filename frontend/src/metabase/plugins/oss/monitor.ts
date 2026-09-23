import type { ComponentType, ReactNode } from "react";

import { definePluginSlot } from "../slot";

type MonitorPlugin = {
  isDependencyDiagnosticsEnabled: boolean;
  getDependencyDiagnosticsRoutes: () => ReactNode;
  isRelatedQuestionsEnabled: boolean;
  getRelatedQuestionsRoutes: () => ReactNode;
};

const getDefaultPluginMonitor = (): MonitorPlugin => ({
  isDependencyDiagnosticsEnabled: false,
  getDependencyDiagnosticsRoutes: () => null,
  isRelatedQuestionsEnabled: false,
  getRelatedQuestionsRoutes: () => null,
});

export const PLUGIN_MONITOR = definePluginSlot(getDefaultPluginMonitor);

const getDefaultMonitorTools = (): { COMPONENT: ComponentType | null } => ({
  COMPONENT: null,
});

export const PLUGIN_MONITOR_TOOLS: {
  COMPONENT: ComponentType | null;
} = definePluginSlot(getDefaultMonitorTools);
