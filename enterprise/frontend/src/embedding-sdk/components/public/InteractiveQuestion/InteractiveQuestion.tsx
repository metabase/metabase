import { type PropsWithChildren, type ReactNode, useMemo } from "react";
import _ from "underscore";

import { InteractiveQuestionResult } from "embedding-sdk/components/private/InteractiveQuestionResult";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import type { CardId, ParameterId } from "metabase-types/api";

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
import { InteractiveQuestionProvider } from "./context";

type ParameterValues = Record<ParameterId, string | number>;

type InteractiveQuestionProps = PropsWithChildren<{
  questionId: CardId;
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: ReactNode;
  plugins?: SdkPluginsConfig;
  height?: string | number;
  parameterValues?: ParameterValues;
}>;

export const _InteractiveQuestion = ({
  questionId,
  withResetButton = true,
  withTitle = false,
  customTitle,
  plugins,
  height,
  children = null,
  parameterValues,
}: InteractiveQuestionProps): JSX.Element | null => {
  const { location, params } = useMemo(() => {
    return getQuestionParameters(questionId, parameterValues);
  }, [questionId, parameterValues]);

  return (
    <InteractiveQuestionProvider
      location={location}
      params={params}
      componentPlugins={plugins}
    >
      {children ?? (
        <InteractiveQuestionResult
          height={height}
          customTitle={customTitle}
          withResetButton={withResetButton}
          withTitle={withTitle}
        />
      )}
    </InteractiveQuestionProvider>
  );
};

export const getQuestionParameters = (
  questionId: CardId,
  parameterValues?: ParameterValues,
) => {
  const query = parameterValues
    ? _.mapObject(parameterValues, value => String(value))
    : {};

  return {
    location: { pathname: `/question/${questionId}`, query, hash: "" },
    params: { slug: questionId.toString() },
  };
};

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
