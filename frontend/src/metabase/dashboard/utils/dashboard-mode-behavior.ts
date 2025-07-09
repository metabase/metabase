import { Mode } from "metabase/visualizations/click-actions/Mode/Mode";
import type { DashboardMode, DashboardModeConfig } from "../types/dashboard-mode";
import {
  resolveDashboardMode,
  resolveDashboardActions,
  resolveQuestionMode,
  resolveNavigation,
} from "./dashboard-mode-resolver";

export interface DashboardBehaviorOptions {
  mode?: DashboardMode;
  isEditing: boolean;
  downloadsEnabled: { pdf?: boolean; results?: boolean };
}

export interface DashboardBehaviors {
  dashboardActions: any[] | null;
  navigateToNewCard: ((opts: any) => void) | null;
  getClickActionMode: ((data: { question: any }) => any) | undefined;
}

export function resolveDashboardBehaviors(options: DashboardBehaviorOptions): DashboardBehaviors {
  const { mode, isEditing, downloadsEnabled } = options;
  
  if (!mode) {
    return {
      dashboardActions: null,
      navigateToNewCard: null,
      getClickActionMode: undefined,
    };
  }

  const resolvedMode = resolveDashboardMode(mode);
  
  return {
    dashboardActions: resolveDashboardActions({
      actions: resolvedMode.dashboard.actions,
      editing: resolvedMode.dashboard.editing && isEditing,
      downloadsEnabled,
    }),
    navigateToNewCard: resolveNavigation(resolvedMode.questions.navigation),
    getClickActionMode: buildClickActionMode(resolvedMode),
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