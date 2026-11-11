import { match } from "ts-pattern";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { QuestionInfoSidebar } from "../../sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "../../sidebars/QuestionSettingsSidebar";
import { SummarySidebar } from "../../sidebars/SummarySidebar";
import { TimelineSidebar } from "../../sidebars/TimelineSidebar";

interface StructuredQueryRightSidebarProps {
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  isShowingSummarySidebar: boolean;
  isShowingTimelineSidebar: boolean;
  onSave: (question: Question) => Promise<void>;
  question: Question;
  updateQuestion: (question: Question, opts?: { run?: boolean }) => void;
}

export const StructuredQueryRightSidebar = ({
  isShowingQuestionInfoSidebar,
  isShowingQuestionSettingsSidebar,
  isShowingSummarySidebar,
  isShowingTimelineSidebar,
  onSave,
  question,
  updateQuestion,
}: StructuredQueryRightSidebarProps) => {
  const query = question.query();
  const summaryStageIndex = Lib.stageIndexes(query).findLast(
    (stageIndex) =>
      Lib.aggregations(query, stageIndex).length > 0 ||
      Lib.breakouts(query, stageIndex).length > 0,
  );
  return match({
    isSaved: question.isSaved(),
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  })
    .with({ isShowingSummarySidebar: true }, () => (
      <SummarySidebar
        query={query}
        generatedExpressions={
          question.settings()["summary.generated_expressions"]
        }
        onQueryChange={(nextQuery, generatedExpressions) => {
          let nextQuestion = question.setQuery(nextQuery);
          if (
            generatedExpressions.length > 0 ||
            question.settings()["summary.generated_expressions"]
          ) {
            nextQuestion = nextQuestion.updateSettings({
              "summary.generated_expressions": generatedExpressions,
            });
          }
          updateQuestion(nextQuestion.setDefaultDisplay(), { run: true });
        }}
        stageIndex={summaryStageIndex ?? -1}
      />
    ))
    .with({ isShowingTimelineSidebar: true }, () => <TimelineSidebar />)
    .with(
      {
        isSaved: true,
        isShowingQuestionInfoSidebar: true,
      },
      () => <QuestionInfoSidebar question={question} onSave={onSave} />,
    )
    .with(
      {
        isSaved: true,
        isShowingQuestionSettingsSidebar: true,
      },
      () => <QuestionSettingsSidebar question={question} />,
    )
    .otherwise(() => null);
};
