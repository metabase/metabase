import React from "react";
import { t } from "c-3po";

import Button from "metabase/components/Button";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

const QuestionSummaries = ({ question, onRun }) => (
  <div>
    <PopoverWithTrigger
      triggerElement={
        <Button medium icon="insight" color="#84BB4C">{t`Summarize`}</Button>
      }
    >
      <AggregationPopover
        query={question.query()}
        onChangeAggregation={newAggregation => {
          question
            .query()
            .addAggregation(newAggregation)
            .update();
          onRun();
        }}
      />
    </PopoverWithTrigger>
  </div>
);

QuestionSummaries.shouldRender = ({ question, queryBuilderMode }) =>
  question.query().aggregations().length === 0;

export default QuestionSummaries;
