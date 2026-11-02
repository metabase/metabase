import { match } from "ts-pattern";

import { isSlowData } from "metabase/prototype";
import type Question from "metabase-lib/v1/Question";

import { QuestionInfoSidebar } from "../../sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "../../sidebars/QuestionSettingsSidebar";
import { SummarizeSidebar } from "../../sidebars/SummarizeSidebar";
import { TimelineSidebar } from "../../sidebars/TimelineSidebar";

interface StructuredQueryRightSidebarProps {
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  isShowingSummarySidebar: boolean;
  isShowingTimelineSidebar: boolean;
  onCloseSummary: () => void;
  onSave: (question: Question) => Promise<void>;
  question: Question;
  updateQuestion: (
    question: Question,
    opts?: { run?: boolean; shouldUpdateUrl?: boolean },
  ) => void;
}

export const StructuredQueryRightSidebar = ({
  isShowingQuestionInfoSidebar,
  isShowingQuestionSettingsSidebar,
  isShowingSummarySidebar,
  isShowingTimelineSidebar,
  onCloseSummary,
  onSave,
  question,
  updateQuestion,
}: StructuredQueryRightSidebarProps) => {
  return match({
    isSaved: question.isSaved(),
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  })
    .with(
      {
        isShowingSummarySidebar: true,
      },
      () => (
        <SummarizeSidebar
          query={question.query()}
          onQueryChange={(nextQuery) => {
            const nextQuestion = question.setQuery(nextQuery);
            // Prototype: on slow data, a summary change only makes the result
            // out of date, and the user reruns the question with the run
            // button, like with the filters.
            const isSlow = isSlowData();
            updateQuestion(nextQuestion.setDefaultDisplay(), {
              run: !isSlow,
              shouldUpdateUrl: isSlow,
            });
          }}
          onClose={onCloseSummary}
          stageIndex={-1}
        />
      ),
    )
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
