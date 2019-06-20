import React from "react";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/components/Button";

// import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
// import AggregationPopover from "metabase/query_builder/components/AggregationPopover";
// const QuestionSummaries = ({ question, triggerElement }) => (
//   <PopoverWithTrigger
//     triggerElement={
//       <Button
//         medium
//         icon="insight"
//         color="#84BB4C"
//         className="mr2"
//       >{t`Summarize`}</Button>
//     }
//   >
//     <AggregationPopover
//       query={question.query()}
//       onChangeAggregation={newAggregation => {
//         question
//           .query()
//           .addAggregation(newAggregation)
//           .update(null, { run: true });
//       }}
//     />
//   </PopoverWithTrigger>
// );

const QuestionSummaries = ({ className, question, onOpenAddAggregation }) => {
  const query = question.query();
  return (
    <SummarizeButton
      className={className}
      onClick={async () => {
        const query = question.query();
        if (!query.hasAggregations()) {
          await query.addAggregation(["count"]).update(null, { run: true });
        }
        onOpenAddAggregation();
      }}
    >
      {query.hasAggregations() ? t`Edit summary` : t`Summarize`}
    </SummarizeButton>
  );
};

const SummarizeButton = ({ className, children, onClick }) => (
  <Button
    medium
    icon="insight"
    color="#84BB4C"
    className={cx(className, "flex-no-shrink")}
    onClick={onClick}
  >
    {children}
  </Button>
);

QuestionSummaries.shouldRender = ({ question, queryBuilderMode }) =>
  question.isStructured() /*&& question.query().aggregations().length === 0*/;

export default QuestionSummaries;
