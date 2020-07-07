import React from "react";
import { connect } from "react-redux";

import FilterList from "./FilterList";
import AggregationName from "./AggregationName";
import { getMetadata } from "metabase/selectors/metadata";

function QueryDefinition({ className, object, metadata }) {
  const query = metadata
    .question({
      dataset_query: { type: "query", query: object.definition },
    })
    .query();
  const aggregations = query.aggregations();
  const filters = query.filters();
  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      {aggregations.map(aggregation => (
        <AggregationName aggregation={aggregation} />
      ))}
      {filters.length > 0 && (
        <FilterList filters={filters} maxDisplayValues={Infinity} />
      )}
    </div>
  );
}

export default connect(state => ({ metadata: getMetadata(state) }))(
  QueryDefinition,
);
