import type { ActionCreatorWithOptionalPayload } from "@reduxjs/toolkit";
import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import type { TypedUseLazyQuery } from "@reduxjs/toolkit/src/query/react/buildHooks";
import type { ComponentType } from "react";
import React from "react";

import type { MetabotContext } from "metabase/metabot";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import type Question from "metabase-lib/v1/Question";
import type {
  CollectionId,
  DashCardId,
  DatabaseId,
  GenerateSqlResponse,
  MetabotGenerateContentRequest,
  MetabotGenerateContentResponse,
  MetabotSuggestedTransform,
  ReferencedEntityId,
  SearchModel,
  SuggestedTransform,
  Timeline,
  TimelineEvent,
  TransformId,
  VisualizationDisplay,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

export type PluginAiSqlFixer = {
  FixSqlQueryButton: ComponentType<{
    rawSql?: string | null;
    errorMessage?: string | null;
  }>;
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
  MetabotChat: (props: {
    config?: PluginMetabotConfig;
  }) => React.ReactElement | null;
  defaultMetabotContextValue: MetabotContext;
  MetabotContext: React.Context<MetabotContext>;
  getMetabotProvider: () => ComponentType<{ children: React.ReactNode }>;
  getAdminRoutes: (() => JSX.Element[]) | null;
  getMetabotRoutes: () => React.ReactElement | null;
  getMetabotQueryBuilderRoute: () => React.ReactElement | null;
  getNewMenuItemAIExploration: (
    hasDataAccess: boolean,
    collectionId?: CollectionId,
  ) => React.ReactElement | undefined;
  getMetabotVisible: (state: State, conversation_id: string) => boolean;
  MetabotAppBarButton: ComponentType;
  MetabotDataStudioButton: ComponentType;
  MetabotDataStudioSidebar: ComponentType;
  useLazyMetabotGenerateContentQuery: TypedUseLazyQuery<
    MetabotGenerateContentResponse,
    MetabotGenerateContentRequest,
    BaseQueryFn
  >;
  MetabotThinkingStyles: { [key: string]: string };
  useMetabotSQLSuggestion: (options: {
    databaseId: DatabaseId | null;
    bufferId: string;
    onGenerated?: (result?: GenerateSqlResponse) => void;
  }) => {
    source: string | undefined;
    isLoading: boolean;
    generate: (options: {
      prompt: string;
      sourceSql?: string;
      referencedEntities?: ReferencedEntityId[];
    }) => Promise<void>;
    error: string | undefined;
    cancelRequest: () => void;
    clear: () => void;
    reject: () => void;
    reset: () => void;
    suggestionModels: SuggestionModel[];
  };
  getMetabotSuggestedTransform: (
    state: State,
    transformId?: TransformId,
  ) => MetabotSuggestedTransform | undefined;
  deactivateSuggestedTransform: ActionCreatorWithOptionalPayload<
    SuggestedTransform["id"] | undefined
  >;
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

const getDefaultMetabotContextValue = (): MetabotContext => ({
  prompt: "",
  setPrompt: () => {},
  promptInputRef: undefined,
  getChatContext: () => ({}) as any,
  registerChatContextProvider: () => () => {},
  suggestionActions: null,
  setSuggestionActions: () => {},
});

const defaultMetabotContextValue: MetabotContext =
  getDefaultMetabotContextValue();

const getDefaultPluginMetabot = (): PluginMetabotType => ({
  isEnabled: () => false,
  Metabot: (_props: { hide?: boolean; config?: PluginMetabotConfig }) =>
    null as React.ReactElement | null,
  MetabotChat: (_props: { config?: PluginMetabotConfig }) =>
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
  getAdminRoutes: null,
  getMetabotRoutes: () => null,
  getMetabotQueryBuilderRoute: () => null,
  getNewMenuItemAIExploration: () => undefined,
  getMetabotVisible: () => false,
  MetabotAppBarButton: PluginPlaceholder,
  MetabotDataStudioButton: PluginPlaceholder,
  MetabotDataStudioSidebar: PluginPlaceholder,
  useLazyMetabotGenerateContentQuery:
    (() => []) as unknown as PluginMetabotType["useLazyMetabotGenerateContentQuery"],
  MetabotThinkingStyles: {},
  useMetabotSQLSuggestion: (options) => {
    // lazy require to avoid loading metabase/api and its cljs dependencies at
    // module init time. without this the jest unit tests will break.
    const {
      useMetabotSQLSuggestion,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require("metabase/metabot/hooks/use-metabot-sql-suggestion");
    return useMetabotSQLSuggestion(options);
  },
  getMetabotSuggestedTransform: () => undefined,
  deactivateSuggestedTransform: (() => ({
    type: "",
    payload: undefined,
    match: () => false,
  })) as unknown as ActionCreatorWithOptionalPayload<
    SuggestedTransform["id"] | undefined
  >,
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
