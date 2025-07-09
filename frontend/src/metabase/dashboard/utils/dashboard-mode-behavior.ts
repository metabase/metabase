import { Mode } from "metabase/visualizations/click-actions/Mode/Mode";
import type { DashboardMode, DashboardModeConfig } from "../types/dashboard-mode";
import {
  resolveDashboardMode,
  resolveDashboardActions,
  resolveQuestionMode,
  resolveNavigation,
} from "./dashboard-mode-resolver";

export interface DashboardBehaviorInput {
  dashboardMode?: DashboardMode;
  isEditing: boolean;
  downloadsEnabled: { pdf?: boolean; results?: boolean };
}

export interface DashboardBehaviorOutput {
  dashboardActions: any[] | null;
  navigateToNewCardFromDashboard: ((opts: any) => void) | null;
  getClickActionMode: ((data: { question: any }) => any) | undefined;
}

export function resolveDashboardBehaviors(input: DashboardBehaviorInput): DashboardBehaviorOutput {
  const { dashboardMode, isEditing, downloadsEnabled } = input;
  
  if (!dashboardMode) {
    return createDefaultBehaviors();
  }

  const resolvedMode = resolveDashboardMode(dashboardMode);
  
  return {
    dashboardActions: resolveDashboardActions({
      actions: resolvedMode.dashboard.actions,
      editing: resolvedMode.dashboard.editing && isEditing,
      downloadsEnabled,
    }),
    navigateToNewCardFromDashboard: resolveNavigation(resolvedMode.questions.navigation),
    getClickActionMode: buildClickActionMode(resolvedMode),
  };
}

function createDefaultBehaviors(): DashboardBehaviorOutput {
  return {
    dashboardActions: null,
    navigateToNewCardFromDashboard: null,
    getClickActionMode: undefined,
  };
}


function buildClickActionMode(resolvedMode: DashboardModeConfig) {
  return ({ question }: { question: any }) => {
    const questionMode = resolveQuestionMode({
      config: resolvedMode.questions,
    });
    return new Mode(question, questionMode, undefined);
  };
}