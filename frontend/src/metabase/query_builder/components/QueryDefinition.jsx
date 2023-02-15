/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import { buildQuestion } from "metabase-lib/Question";

import FilterList from "./FilterList";

function QueryDefinition({ className, object, metadata }) {
  const query = buildQuestion({
    card: {
      dataset_query: { type: "query", query: object.definition },
    },
    metadata,
  }).query();
  const aggregations = query.aggregations();
  const filters = query.filters();
  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      {aggregations.map(aggregation => aggregation.displayName())}
      {filters.length > 0 && (
        <FilterList filters={filters} maxDisplayValues={Infinity} />
      )}
    </div>
  );
}

export default connect(state => ({ metadata: getMetadata(state) }))(
  QueryDefinition,
);
