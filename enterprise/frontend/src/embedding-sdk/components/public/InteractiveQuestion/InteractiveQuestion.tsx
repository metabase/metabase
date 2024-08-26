import type { PropsWithChildren } from "react";

import {
  BackButton,
  Filter,
  FilterBar,
  FilterButton,
  Notebook,
  NotebookButton,
  QuestionResetButton,
  QuestionVisualization,
  SaveButton,
  SaveQuestion,
  Summarize,
  SummarizeButton,
  Title,
} from "embedding-sdk/components/private/InteractiveQuestion/components";
import { InteractiveQuestionProvider } from "embedding-sdk/components/private/InteractiveQuestion/context";
import {
  InteractiveQuestionResult,
  type InteractiveQuestionResultProps,
} from "embedding-sdk/components/private/InteractiveQuestionResult";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { useTranslateEntityIdQuery } from "metabase/api";
import type {
  Card,
  CardEntityId,
  CardId,
  CollectionItemModel,
} from "metabase-types/api";

export type InteractiveQuestionProps = PropsWithChildren<{
  questionId?: Card["id"] | Card["entity_id"];
  plugins?: SdkPluginsConfig;
}>;

export const useValidIdForEntity = ({
  type,
  id,
}: {
  type: CollectionItemModel;
  id: CardId | CardEntityId;
}) => {
  const { data: entity_ids, ...rest } = useTranslateEntityIdQuery({
    [type]: [id],
  });

  return {
    ...rest,
    id: (!rest.isLoading && entity_ids && entity_ids.entity_ids?.[id]) ?? id,
  };
};

export const _InteractiveQuestion = ({
  questionId,
  withResetButton = true,
  withTitle = false,
  customTitle,
  plugins,
  height,
  children = null,
}: InteractiveQuestionProps &
  InteractiveQuestionResultProps): JSX.Element | null => {
  const { id } = useValidIdForEntity({
    type: "Card",
    id: questionId,
  });

  if (!id) {
    return <div>Loading...</div>;
  }

  return (
    <InteractiveQuestionProvider cardId={id} componentPlugins={plugins}>
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
  SaveQuestionForm: typeof SaveQuestion;
  SaveButton: typeof SaveButton;
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
InteractiveQuestion.SaveQuestionForm = SaveQuestion;
InteractiveQuestion.SaveButton = SaveButton;

export { InteractiveQuestion };
