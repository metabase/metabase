/* eslint-disable react/prop-types */
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import ViewButton from "./ViewButton";
import { HeaderButton } from "./ViewHeader.styled";

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

export function MobileQuestionSummarizeWidget({
  isShowingSummarySidebar,
  onEditSummary,
  onCloseSummary,
  ...props
}) {
  return (
    <ViewButton
      medium
      primary
      icon="insight"
      data-testid="toggle-summarize-sidebar-button"
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
      &nbsp;
    </ViewButton>
  );
}

QuestionSummarizeWidget.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
  isActionListVisible,
}) =>
  queryBuilderMode === "view" &&
  question &&
  question.isStructured() &&
  question.isQueryEditable() &&
  question.legacyQuery().table() &&
  !isObjectDetail &&
  isActionListVisible;
