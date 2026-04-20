import type { FC } from "react";
import { useMemo } from "react";

import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkInternalNavigationBackButton } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationBackButton";
import {
  BackButton,
  Breakout,
  BreakoutDropdown,
  ChartTypeDropdown,
  ChartTypeSelector,
  DownloadWidget,
  DownloadWidgetDropdown,
  Editor,
  EditorButton,
  Filter,
  FilterDropdown,
  QuestionResetButton,
  QuestionSettings,
  QuestionSettingsDropdown,
  QuestionVisualization,
  SaveButton,
  SdkSaveQuestionForm,
  SqlParametersList,
  Summarize,
  SummarizeDropdown,
  Title,
  VisualizationButton,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";
import type {
  SdkQuestionEntityInternalProps,
  SdkQuestionEntityPublicProps,
} from "embedding-sdk-bundle/types/question";
import { deserializeCardFromQuery } from "metabase/utils/card";

import { QuestionAlertsButton } from "../notifications/QuestionAlertsButton";

import { interactiveQuestionSchema } from "./InteractiveQuestion.schema";

export type InteractiveQuestionBaseProps = Omit<
  SdkQuestionProps,
  | "token"
  | "questionId"
  | "getClickActionMode"
  | "navigateToNewCard"
  | "backToDashboard"
>;

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionProps = InteractiveQuestionBaseProps &
  SdkQuestionEntityPublicProps;

/**
 * Internal type that includes the `query` prop used by the `useMetabot` hook.
 * Not re-exported from the public SDK package entry point.
 */
export type InteractiveQuestionInternalProps = InteractiveQuestionBaseProps &
  SdkQuestionEntityInternalProps;

/**
 * @interface
 */
export type InteractiveQuestionComponents = {
  /** @deprecated Use `InteractiveQuestion.NavigationBackButton` instead */
  BackButton: typeof BackButton;
  /** Back button to navigate back after drills and internal navigation. It will render null if there's nothing to go back to */
  NavigationBackButton: typeof SdkInternalNavigationBackButton;
  Filter: typeof Filter;
  FilterDropdown: typeof FilterDropdown;
  ResetButton: typeof QuestionResetButton;
  Title: typeof Title;
  Summarize: typeof Summarize;
  SummarizeDropdown: typeof SummarizeDropdown;
  /** @deprecated Use `InteractiveQuestion.Editor` instead */
  Notebook: typeof Editor;
  Editor: typeof Editor;
  /** @deprecated Use `InteractiveQuestion.EditorButton` instead */
  NotebookButton: typeof EditorButton;
  EditorButton: typeof EditorButton;
  QuestionVisualization: typeof QuestionVisualization;
  VisualizationButton: typeof VisualizationButton;
  SaveQuestionForm: typeof SdkSaveQuestionForm;
  SaveButton: typeof SaveButton;
  ChartTypeSelector: typeof ChartTypeSelector;
  ChartTypeDropdown: typeof ChartTypeDropdown;
  QuestionSettings: typeof QuestionSettings;
  QuestionSettingsDropdown: typeof QuestionSettingsDropdown;
  Breakout: typeof Breakout;
  BreakoutDropdown: typeof BreakoutDropdown;
  DownloadWidget: typeof DownloadWidget;
  DownloadWidgetDropdown: typeof DownloadWidgetDropdown;
  AlertsButton: typeof QuestionAlertsButton;
  SqlParametersList: typeof SqlParametersList;
};

function InteractiveQuestionInner({
  query,
  ...rest
}: InteractiveQuestionInternalProps) {
  const deserializedCard = useMemo(
    () => (query ? deserializeCardFromQuery(query) : undefined),
    [query],
  );

  return <SdkQuestion {...rest} deserializedCard={deserializedCard} />;
}

export const _InteractiveQuestion = InteractiveQuestionInner;

const subComponents: InteractiveQuestionComponents = {
  BackButton: BackButton,
  NavigationBackButton: SdkInternalNavigationBackButton,
  Filter: Filter,
  FilterDropdown: FilterDropdown,
  ResetButton: QuestionResetButton,
  Title: Title,
  Summarize: Summarize,
  SummarizeDropdown: SummarizeDropdown,
  Notebook: Editor,
  Editor: Editor,
  NotebookButton: EditorButton,
  EditorButton: EditorButton,
  QuestionVisualization: QuestionVisualization,
  SaveQuestionForm: SdkSaveQuestionForm,
  SaveButton: SaveButton,
  ChartTypeSelector: ChartTypeSelector,
  QuestionSettings: QuestionSettings,
  QuestionSettingsDropdown: QuestionSettingsDropdown,
  BreakoutDropdown: BreakoutDropdown,
  Breakout: Breakout,
  ChartTypeDropdown: ChartTypeDropdown,
  DownloadWidget: DownloadWidget,
  DownloadWidgetDropdown: DownloadWidgetDropdown,
  AlertsButton: QuestionAlertsButton,
  VisualizationButton: VisualizationButton,
  SqlParametersList: SqlParametersList,
};

const _InteractiveQuestionWrapped = withPublicComponentWrapper(
  _InteractiveQuestion,
  { supportsGuestEmbed: false },
);

export const InteractiveQuestion = Object.assign(
  _InteractiveQuestionWrapped as FC<InteractiveQuestionProps>,
  subComponents,
  { schema: interactiveQuestionSchema },
);

/**
 * Same runtime component as {@link InteractiveQuestion}, typed to accept the
 * internal `query` prop. This component is intended for internal use only.
 */
export const InteractiveQuestionInternal = Object.assign(
  _InteractiveQuestionWrapped as FC<InteractiveQuestionInternalProps>,
  subComponents,
  { schema: interactiveQuestionSchema },
);
