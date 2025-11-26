import type { ComponentType } from "react";
import React from "react";

import type { MetabotContext } from "metabase/metabot";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type {
  DashCardId,
  SearchModel,
  Timeline,
  TimelineEvent,
  VisualizationDisplay,
} from "metabase-types/api";
import type { AdminPath, State } from "metabase-types/store";

export type PluginAiSqlFixer = {
  FixSqlQueryButton: ComponentType<Record<string, never>>;
};

export interface AIDashboardAnalysisSidebarProps {
  onClose?: () => void;
  dashcardId?: DashCardId;
}

export interface AIQuestionAnalysisSidebarProps {
  question: Question;
  className?: string;
  onClose?: () => void;
  timelines?: Timeline[];
  visibleTimelineEvents?: TimelineEvent[];
}

export type PluginAIEntityAnalysis = {
  AIQuestionAnalysisButton: ComponentType<any>;
  AIQuestionAnalysisSidebar: ComponentType<AIQuestionAnalysisSidebarProps>;
  AIDashboardAnalysisSidebar: ComponentType<AIDashboardAnalysisSidebarProps>;
  canAnalyzeQuestion: (question: Question) => boolean;
  chartAnalysisRenderFormats: {
    [display in VisualizationDisplay]?: "png" | "svg" | "none";
  };
};

type PluginMetabotConfig = {
  emptyText?: string;
  hideSuggestedPrompts?: boolean;
  preventClose?: boolean;
  preventRetryMessage?: boolean;
  suggestionModels: (SearchModel | "transform" | "user")[];
};

type PluginMetabotType = {
  isEnabled: () => boolean;
  Metabot: (props: {
    hide?: boolean;
    config?: PluginMetabotConfig;
  }) => React.ReactElement | null;
  defaultMetabotContextValue: MetabotContext;
  MetabotContext: React.Context<MetabotContext>;
  getMetabotProvider: () => ComponentType<{ children: React.ReactNode }>;
  getAdminPaths: () => AdminPath[];
  getAdminRoutes: () => React.ReactElement;
  getMetabotRoutes: () => React.ReactElement | null;
  MetabotAdminPage: ComponentType;
  getMetabotVisible: (state: State) => boolean;
  MetabotToggleButton: ComponentType<{ className?: string }>;
  MetabotAppBarButton: ComponentType;
  MetabotAdminAppBarButton: ComponentType;
  MetabotDataStudioButton: ComponentType;
  MetabotDataStudioSidebar: ComponentType;
};

const getDefaultMetabotContextValue = (): MetabotContext => ({
  prompt: "",
  setPrompt: () => {},
  promptInputRef: undefined,
  getChatContext: () => ({}) as any,
  registerChatContextProvider: () => () => {},
});

const defaultMetabotContextValue: MetabotContext =
  getDefaultMetabotContextValue();

const getDefaultPluginAiSqlFixer = (): PluginAiSqlFixer => ({
  FixSqlQueryButton: PluginPlaceholder,
});
export const PLUGIN_AI_SQL_FIXER: PluginAiSqlFixer =
  getDefaultPluginAiSqlFixer();

const getDefaultPluginAIEntityAnalysis = (): PluginAIEntityAnalysis => ({
  AIQuestionAnalysisButton: PluginPlaceholder,
  AIQuestionAnalysisSidebar: PluginPlaceholder,
  AIDashboardAnalysisSidebar: PluginPlaceholder,
  canAnalyzeQuestion: () => false,
  chartAnalysisRenderFormats: {},
});
export const PLUGIN_AI_ENTITY_ANALYSIS: PluginAIEntityAnalysis =
  getDefaultPluginAIEntityAnalysis();

const getDefaultPluginMetabot = (): PluginMetabotType => ({
  isEnabled: () => false,
  Metabot: (_props: { hide?: boolean; config?: PluginMetabotConfig }) =>
    null as React.ReactElement | null,
  defaultMetabotContextValue,
  MetabotContext: React.createContext(defaultMetabotContextValue),
  getMetabotProvider: () => {
    return ({ children }) =>
      React.createElement(
        PLUGIN_METABOT.MetabotContext.Provider,
        { value: PLUGIN_METABOT.defaultMetabotContextValue },
        children,
      );
  },
  getAdminPaths: () => [],
  getAdminRoutes: () => PluginPlaceholder as unknown as React.ReactElement,
  getMetabotRoutes: () => null,
  MetabotAdminPage: () => `placeholder`,
  getMetabotVisible: () => false,
  MetabotToggleButton: PluginPlaceholder,
  MetabotAppBarButton: PluginPlaceholder,
  MetabotAdminAppBarButton: PluginPlaceholder,
  MetabotDataStudioButton: PluginPlaceholder,
  MetabotDataStudioSidebar: PluginPlaceholder,
});
export const PLUGIN_METABOT: PluginMetabotType = getDefaultPluginMetabot();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_AI_SQL_FIXER, getDefaultPluginAiSqlFixer());
  Object.assign(PLUGIN_AI_ENTITY_ANALYSIS, getDefaultPluginAIEntityAnalysis());
  Object.assign(PLUGIN_METABOT, getDefaultPluginMetabot());
}
