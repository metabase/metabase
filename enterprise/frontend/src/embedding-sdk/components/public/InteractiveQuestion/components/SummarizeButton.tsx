import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { QuestionSummarizeWidget } from "metabase/query_builder/components/view/ViewHeader/components";
import * as Lib from "metabase-lib";

import { useInteractiveQuestionData } from "../hooks";

export const SummarizeButton = ({
  isOpen,
  onOpen,
  onClose,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) => {
  const { question } = useInteractiveQuestionData();

  let shouldShowButton = true;
  if (question) {
    const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
    shouldShowButton = !isNative && isEditable && !question.isArchived();
  }

  return (
    shouldShowButton && (
      <QuestionSummarizeWidget
        className={cx(CS.hide, CS.smShow)}
        isShowingSummarySidebar={isOpen}
        onEditSummary={onOpen}
        onCloseSummary={onClose}
      />
    )
  );
};
