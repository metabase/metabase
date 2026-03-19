import type { ComponentType } from "react";
import type React from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import type Question from "metabase-lib/v1/Question";
import type {
  DashCardId,
  DatabaseId,
  GenerateSqlResponse,
  ReferencedEntityId,
  Timeline,
  TimelineEvent,
  VisualizationDisplay,
} from "metabase-types/api";

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

type PluginMetabotType = {
  getAdminRoutes: (() => JSX.Element[]) | null;
  getMetabotRoutes: () => React.ReactElement | null;
  getMetabotQueryBuilderRoute: () => React.ReactElement | null;
  MetabotSlackSetup: ComponentType;
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
  getAdminRoutes: null,
  getMetabotRoutes: () => null,
  getMetabotQueryBuilderRoute: () => null,
  MetabotSlackSetup: PluginPlaceholder,
  useMetabotSQLSuggestion: (options) => {
    // lazy require to avoid loading metabase/api and its cljs dependencies at
    // module init time. without this the jest unit tests will break.
    const {
      useMetabotSQLSuggestion,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require("metabase/metabot/hooks/use-metabot-sql-suggestion");
    return useMetabotSQLSuggestion(options);
  },
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
