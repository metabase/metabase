import React from "react";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import ViewPill from "./ViewPill";
import ViewButton from "./ViewButton";

import SummarizeSidebar from "./sidebars/SummarizeSidebar";

import { color } from "metabase/lib/colors";

const SummarizePill = props => (
  <ViewPill icon="insight" color={color("accent1")} {...props} />
);

const SummarizeButton = props => (
  <ViewButton
    medium
    icon="insight"
    color={color("accent1")}
    labelBreakpoint="sm"
    {...props}
  />
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
    <SummarizeButton
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
    </SummarizeButton>
  );
}

QuestionSummaries.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question &&
  question.isStructured() &&
  question
    .query()
    .topLevelQuery()
    .hasAggregations() &&
  !question.isObjectDetail();

QuestionSummarizeWidget.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question &&
  question.isStructured() &&
  question.query().isEditable() &&
  question.query().table() &&
  !question.isObjectDetail();
