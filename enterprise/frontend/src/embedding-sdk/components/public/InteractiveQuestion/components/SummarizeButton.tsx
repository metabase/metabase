import cx from "classnames";

import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { QuestionSummarizeWidget } from "metabase/query_builder/components/view/ViewHeader/components";
import * as Lib from "metabase-lib";

export const SummarizeButton = () => {
  const { question, isSummarizeOpen, setIsSummarizeOpen } =
    useInteractiveQuestionContext();

  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    !isNative &&
    isEditable &&
    !question.isArchived() &&
    question && (
      <QuestionSummarizeWidget
        className={cx(CS.hide, CS.smShow)}
        isShowingSummarySidebar={isSummarizeOpen}
        onEditSummary={() => setIsSummarizeOpen(true)}
        onCloseSummary={() => setIsSummarizeOpen(false)}
      />
    )
  );
};
