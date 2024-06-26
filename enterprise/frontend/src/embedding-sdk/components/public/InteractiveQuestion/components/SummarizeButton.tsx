import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { QuestionSummarizeWidget } from "metabase/query_builder/components/view/ViewHeader/components";
import * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../context/context";

export const SummarizeButton = () => {
  const { question, isSummarizeOpen, setIsSummarizeOpen } =
    useInteractiveQuestionContext();

  let shouldShowButton = true;
  if (question) {
    const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
    shouldShowButton = !isNative && isEditable && !question.isArchived();
  }

  return (
    shouldShowButton && (
      <QuestionSummarizeWidget
        className={cx(CS.hide, CS.smShow)}
        isShowingSummarySidebar={isSummarizeOpen}
        onEditSummary={() => setIsSummarizeOpen(true)}
        onCloseSummary={() => setIsSummarizeOpen(false)}
      />
    )
  );
};
