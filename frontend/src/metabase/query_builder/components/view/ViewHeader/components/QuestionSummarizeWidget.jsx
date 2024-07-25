/* eslint-disable react/prop-types */
import { t } from "ttag";

import * as Lib from "metabase-lib";

import { SummarizeButton } from "../ViewTitleHeader.styled";

export function QuestionSummarizeWidget({
  isShowingSummarySidebar,
  onEditSummary,
  onCloseSummary,
  className,
}) {
  return (
    <SummarizeButton
      color="summarize"
      variant={isShowingSummarySidebar ? "filled" : "default"}
      onClick={async () => {
        if (isShowingSummarySidebar) {
          onCloseSummary();
        } else {
          onEditSummary();
        }
      }}
      data-active={isShowingSummarySidebar}
      className={className}
    >
      {t`Summarize`}
    </SummarizeButton>
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
