import { connect } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";

import { FilterList } from "../FilterList";

function _QueryDefinition({ className, object, metadata }) {
  const query = new Question(
    {
      dataset_query: { type: "query", query: object.definition },
    },
    metadata,
  ).legacyQuery({ useStructuredQuery: true });
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

/**
 * @deprecated use MLv2
 */
export const QueryDefinition = connect(state => ({
  metadata: getMetadata(state),
}))(_QueryDefinition);
