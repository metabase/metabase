/* eslint-disable react/prop-types */
import { connect } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/Question";

import FilterList from "./FilterList";

function QueryDefinition({ className, object, metadata }) {
  const query = new Question(
    {
      dataset_query: { type: "query", query: object.definition },
    },
    metadata,
  ).query();
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
