import React from "react";

import FilterList from "../FilterList";
import AggregationName from "../AggregationName";

import Question from "metabase-lib/lib/Question";

const QueryDefinition = ({ className, object, metadata }) => {
  const query = new Question(metadata, {
    dataset_query: { type: "query", query: object.definition },
  }).query();
  const aggregations = query.aggregations();
  const filters = query.filters();
  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      {aggregations.map(aggregation => (
        <AggregationName
          aggregation={object.definition.aggregation[0]}
          query={query}
        />
      ))}
      {filters.length > 0 && (
        <FilterList filters={filters} maxDisplayValues={Infinity} />
      )}
    </div>
  );
};

export default QueryDefinition;
