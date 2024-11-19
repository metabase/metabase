import cx from "classnames";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { QuestionSummarizeWidget } from "metabase/query_builder/components/view/ViewHeader/components";
import * as Lib from "metabase-lib";

export const SummarizeButton = ({
  isOpen,
  onOpen,
  onClose,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) => {
  const { question } = useInteractiveQuestionContext();

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
