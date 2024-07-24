/* eslint-disable react/prop-types */
import { t } from "ttag";

import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";

export function QuestionSummarizeWidget({
  isShowingSummarySidebar,
  onEditSummary,
  onCloseSummary,
  className,
}) {
  return (
    <Button
      color="summarize"
      variant={isShowingSummarySidebar ? "filled" : "default"}
      onClick={async () => {
        if (isShowingSummarySidebar) {
          onCloseSummary();
        } else {
          onEditSummary();
        }
      }}
      active={isShowingSummarySidebar}
      className={className}
    >
      {t`Summarize`}
    </Button>
  );
}

QuestionSummarizeWidget.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
  isActionListVisible,
}) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    question &&
    !isNative &&
    isEditable &&
    !isObjectDetail &&
    isActionListVisible &&
    !question.isArchived()
  );
};
