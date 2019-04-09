import React from "react";
import { t } from "c-3po";

import Button from "metabase/components/Button";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

const QuestionSummaries = ({ question, onRun, triggerElement }) => (
  <div>
    <PopoverWithTrigger triggerElement={triggerElement}>
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
  question.isStructured() && question.query().aggregations().length === 0;

export default QuestionSummaries;
