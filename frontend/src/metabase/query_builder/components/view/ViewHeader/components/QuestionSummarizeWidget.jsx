/* eslint-disable react/prop-types */
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import * as Lib from "metabase-lib";

import { HeaderButton } from "../ViewHeader.styled";

export function QuestionSummarizeWidget({
  isShowingSummarySidebar,
  onEditSummary,
  onCloseSummary,
  ...props
}) {
  return (
    <HeaderButton
      large
      color={color("summarize")}
      labelBreakpoint="sm"
      onClick={async () => {
        if (isShowingSummarySidebar) {
          onCloseSummary();
        } else {
          onEditSummary();
        }
      }}
      active={isShowingSummarySidebar}
      {...props}
    >
      {t`Summarize`}
    </HeaderButton>
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
    isActionListVisible
  );
};
