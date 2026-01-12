import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import type { TypedUseLazyQuery } from "@reduxjs/toolkit/src/query/react/buildHooks";
import type { Extension } from "@uiw/react-codemirror";
import type { ComponentType } from "react";
import type React from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type {
  CollectionId,
  DashCardId,
  DatasetQuery,
  MetabotGenerateContentRequest,
  MetabotGenerateContentResponse,
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
  isOmnibotEnabled: () => boolean;
  Metabot: (props: {
    hide?: boolean;
    config?: PluginMetabotConfig;
  }) => React.ReactElement | null;
  getAdminPaths: () => AdminPath[];
  getAdminRoutes: () => React.ReactElement;
  getMetabotRoutes: () => React.ReactElement | null;
  MetabotAdminPage: ComponentType;
  getMetabotQueryBuilderRoute: () => React.ReactElement | null;
  getNewMenuItemAIExploration: (
    hasDataAccess: boolean,
    collectionId?: CollectionId,
  ) => React.ReactElement | undefined;
  getMetabotVisible: (state: State, conversation_id: string) => boolean;
  MetabotToggleButton: ComponentType<{ className?: string }>;
  MetabotAppBarButton: ComponentType;
  MetabotAdminAppBarButton: ComponentType;
  MetabotDataStudioButton: ComponentType;
  MetabotDataStudioSidebar: ComponentType;
  useInlineSQLPrompt: (
    question: Question,
    bufferId: string,
  ) => {
    portalElement: React.ReactPortal | null;
    extensions: Extension[];
    proposedQuestion: Question | undefined;
    handleAcceptProposed?: (datasetQuery: DatasetQuery) => void;
    handleRejectProposed?: () => void;
  } | void;
  useLazyMetabotGenerateContentQuery: TypedUseLazyQuery<
    MetabotGenerateContentResponse,
    MetabotGenerateContentRequest,
    BaseQueryFn
  >;
  MetabotThinkingStyles: { [key: string]: string };
};

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
  isOmnibotEnabled: () => false,
  Metabot: (_props: { hide?: boolean; config?: PluginMetabotConfig }) =>
    null as React.ReactElement | null,
  getAdminPaths: () => [],
  getAdminRoutes: () => PluginPlaceholder as unknown as React.ReactElement,
  getMetabotRoutes: () => null,
  MetabotAdminPage: () => `placeholder`,
  getMetabotQueryBuilderRoute: () => null,
  getNewMenuItemAIExploration: () => undefined,
  getMetabotVisible: () => false,
  MetabotToggleButton: PluginPlaceholder,
  MetabotAppBarButton: PluginPlaceholder,
  MetabotAdminAppBarButton: PluginPlaceholder,
  MetabotDataStudioButton: PluginPlaceholder,
  MetabotDataStudioSidebar: PluginPlaceholder,
  useInlineSQLPrompt: () => {},
  useLazyMetabotGenerateContentQuery:
    (() => []) as unknown as PluginMetabotType["useLazyMetabotGenerateContentQuery"],
  MetabotThinkingStyles: {},
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
