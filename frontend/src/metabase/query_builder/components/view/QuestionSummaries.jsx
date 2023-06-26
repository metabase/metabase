/* eslint-disable react/prop-types */
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { color } from "metabase/lib/colors";
import ViewPill from "./ViewPill";
import ViewButton from "./ViewButton";
import { HeaderButton } from "./ViewHeader.styled";

import SummarizeSidebar from "./sidebars/SummarizeSidebar/SummarizeSidebar";

const SummarizePill = props => (
  <ViewPill icon="insight" color={color("summarize")} {...props} />
);
export default function QuestionSummaries({
  question,
  onEditSummary,
  ...props
}) {
  return (
    <PopoverWithTrigger
      triggerElement={<SummarizePill {...props}>{t`Summarized`}</SummarizePill>}
      sizeToFit
    >
      <SummarizeSidebar className="scroll-y" question={question} />
    </PopoverWithTrigger>
  );
}

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

QuestionSummaries.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
}) =>
  queryBuilderMode === "view" &&
  question &&
  question.isStructured() &&
  question.query().topLevelQuery().hasAggregations() &&
  !isObjectDetail;

QuestionSummarizeWidget.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
  isActionListVisible,
}) =>
  queryBuilderMode === "view" &&
  question &&
  question.isStructured() &&
  question.query().isEditable() &&
  question.query().table() &&
  !isObjectDetail &&
  isActionListVisible;
