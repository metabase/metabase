import { type PropsWithChildren, useMemo } from "react";

import { InteractiveQuestionResult } from "embedding-sdk/components/private/InteractiveQuestionResult";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { InteractiveQuestionProvider } from "embedding-sdk/components/public/InteractiveQuestion/context/context";
import type { SdkClickActionPluginsConfig } from "embedding-sdk/lib/plugins";
import type { CardId } from "metabase-types/api";

import {
  BackButton,
  FilterBar,
  QuestionResetButton,
  Title,
  Filter,
  FilterButton,
  Summarize,
  SummarizeButton,
  Notebook,
  NotebookButton,
  QuestionVisualization,
} from "./components";

type InteractiveQuestionProps = PropsWithChildren<{
  questionId: CardId;
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: React.ReactNode;
  plugins?: SdkClickActionPluginsConfig;
  height?: string | number;
}>;

export const _InteractiveQuestion = ({
  questionId,
  withResetButton = true,
  withTitle = false,
  customTitle,
  plugins,
  height,
  children = null,
}: InteractiveQuestionProps): JSX.Element | null => {
  const { location, params } = useMemo(
    () => getQuestionParameters(questionId),
    [questionId],
  );

  return (
    <InteractiveQuestionProvider
      location={location}
      params={params}
      componentPlugins={plugins}
      customTitle={customTitle}
      withResetButton={withResetButton}
      withTitle={withTitle}
    >
      {children ?? <InteractiveQuestionResult height={height} />}
    </InteractiveQuestionProvider>
  );
};

export const getQuestionParameters = (questionId: CardId) => {
  return {
    location: {
      query: {}, // TODO: add here wrapped parameterValues
      hash: "",
      pathname: `/question/${questionId}`,
    },
    params: {
      slug: questionId.toString(),
    },
  };
};

// Define the BackButton property on the InteractiveQuestion component
const InteractiveQuestion = withPublicComponentWrapper(
  _InteractiveQuestion,
) as typeof _InteractiveQuestion & {
  BackButton: typeof BackButton;
  FilterBar: typeof FilterBar;
  Filter: typeof Filter;
  FilterButton: typeof FilterButton;
  ResetButton: typeof QuestionResetButton;
  Title: typeof Title;
  Summarize: typeof Summarize;
  SummarizeButton: typeof SummarizeButton;
  Notebook: typeof Notebook;
  NotebookButton: typeof NotebookButton;
  QuestionVisualization: typeof QuestionVisualization;
};

InteractiveQuestion.BackButton = BackButton;
InteractiveQuestion.FilterBar = FilterBar;
InteractiveQuestion.Filter = Filter;
InteractiveQuestion.FilterButton = FilterButton;
InteractiveQuestion.ResetButton = QuestionResetButton;
InteractiveQuestion.Title = Title;
InteractiveQuestion.Summarize = Summarize;
InteractiveQuestion.SummarizeButton = SummarizeButton;
InteractiveQuestion.Notebook = Notebook;
InteractiveQuestion.NotebookButton = NotebookButton;
InteractiveQuestion.QuestionVisualization = QuestionVisualization;

export { InteractiveQuestion };
