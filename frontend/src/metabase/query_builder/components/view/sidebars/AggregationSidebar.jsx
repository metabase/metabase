import React from "react";
import { t } from "ttag";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

import { color } from "metabase/lib/colors";

const AggregationSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <SidebarContent
      icon="insight"
      title={t`Pick the metric you'd like to see`}
      color={color("accent1")}
      onDone={onClose}
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
