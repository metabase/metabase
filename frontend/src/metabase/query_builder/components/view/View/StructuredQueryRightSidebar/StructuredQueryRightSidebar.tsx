import { useMemo } from "react";
import { match } from "ts-pattern";

import type Question from "metabase-lib/v1/Question";

import type { UpdateQuestionOpts } from "../../../../actions";
import { QuestionInfoSidebar } from "../../sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "../../sidebars/QuestionSettingsSidebar";
import {
  SummarySidebar,
  canPivotSummary,
  getPivotColumnSplit,
  getSummaryQuestion,
  getSummaryStageIndex,
} from "../../sidebars/SummarySidebar";
import { TimelineSidebar } from "../../sidebars/TimelineSidebar";

interface StructuredQueryRightSidebarProps {
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  isShowingSummarySidebar: boolean;
  isShowingTimelineSidebar: boolean;
  onSave: (question: Question) => Promise<void>;
  question: Question;
  updateQuestion: (question: Question, opts?: UpdateQuestionOpts) => void;
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
  const summaryStageIndex = getSummaryStageIndex(query);
  const pivotColumnSplit = useMemo(
    () => (isShowingSummarySidebar ? getPivotColumnSplit(question) : undefined),
    [question, isShowingSummarySidebar],
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
        canPivot={canPivotSummary(question, summaryStageIndex)}
        pivotColumnSplit={pivotColumnSplit}
        onQueryChange={(nextQuery, pivotChange, editedFormula) =>
          updateQuestion(getSummaryQuestion(question, nextQuery, pivotChange), {
            run: true,
            editedFormula,
          })
        }
        stageIndex={summaryStageIndex}
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
