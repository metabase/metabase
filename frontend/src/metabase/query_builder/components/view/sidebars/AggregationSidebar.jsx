import React from "react";
import { t } from "ttag";

import SidebarContent from "metabase/query_builder/components/view/SidebarContent";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

const AggregationSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <SidebarContent
      icon="insight"
      title={t`Pick the metric you'd like to see`}
      onClose={onClose}
    >
      <AggregationPopover
        key={index}
        query={question.query()}
        aggregation={index != null ? query.aggregations()[index] : null}
        onChangeAggregation={aggregation => {
          if (index != null) {
            query
              .updateAggregation(index, aggregation)
              .update(null, { run: true });
          } else {
            query.addAggregation(aggregation).update(null, { run: true });
          }
          onClose();
        }}
        onClose={onClose}
      />
    </SidebarContent>
  );
};

export default AggregationSidebar;
