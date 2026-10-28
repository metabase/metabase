import { match } from "ts-pattern";

import { useSetting } from "metabase/settings";
import type Question from "metabase-lib/v1/Question";

import { getQueryUpdateOptions } from "../../FilterAutoApply/utils";
import { SummarySidebar } from "../../SummarySidebar";
import { QuestionInfoSidebar } from "../../sidebars/QuestionInfoSidebar";
import { QuestionSettingsSidebar } from "../../sidebars/QuestionSettingsSidebar";
import { TimelineSidebar } from "../../sidebars/TimelineSidebar";

interface StructuredQueryRightSidebarProps {
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  isShowingSummarySidebar: boolean;
  isShowingTimelineSidebar: boolean;
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
  onSave,
  question,
  updateQuestion,
}: StructuredQueryRightSidebarProps) => {
  const prototypeData = useSetting("prototype-data");

  return match({
    isSaved: question.isSaved(),
    isShowingSummarySidebar,
    isShowingTimelineSidebar,
    isShowingQuestionInfoSidebar,
    isShowingQuestionSettingsSidebar,
  })
    .with({ isShowingSummarySidebar: true }, () => (
      <SummarySidebar
        question={question}
        onQuestionChange={(nextQuestion) =>
          updateQuestion(
            nextQuestion,
            getQueryUpdateOptions(nextQuestion.query(), prototypeData),
          )
        }
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
