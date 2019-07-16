import React from "react";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import ViewPill from "./ViewPill";
import ViewButton from "./ViewButton";

import SummarizeSidebar from "./sidebars/SummarizeSidebar";

import colors from "metabase/lib/colors";

const SummarizePill = props => (
  <ViewPill icon="insight" color={colors["accent1"]} {...props} />
);

const SummarizeButton = props => (
  <ViewButton medium icon="insight" color={colors["accent1"]} {...props} />
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
  question,
  isShowingSummarySidebar,
  onEditSummary,
  onCloseSummary,
  ...props
}) {
  // topLevelQuery ignores any query stages that don't aggregate, e.x. post-aggregation filters
  const query = question.query().topLevelQuery();
  return (
    <SummarizeButton
      onClick={async () => {
        if (isShowingSummarySidebar) {
          onCloseSummary();
        } else {
          if (!query.hasAggregations()) {
            await query.addAggregation(["count"]).update(null, { run: false });
          }
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
    .hasAggregations();

QuestionSummarizeWidget.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question &&
  question.isStructured() &&
  question.query().table();
