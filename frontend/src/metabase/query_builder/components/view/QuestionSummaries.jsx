import React from "react";
import { t } from "c-3po";

import Button from "metabase/components/Button";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

const QuestionSummaries = ({ question }) => (
  <div>
    <PopoverWithTrigger triggerElement={<Button medium>{t`Summarize`}</Button>}>
      <AggregationPopover
        query={question.query()}
        onChangeAggregation={newAggregation =>
          question
            .query()
            .addAggregation(newAggregation)
            .update()
        }
      />
    </PopoverWithTrigger>
  </div>
);

QuestionSummaries.shouldRender = ({ question, queryBuilderMode }) => true;

export default QuestionSummaries;
