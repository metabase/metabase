import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";
import type {DatasetQuery, NativeDatasetQuery, WrappedDatasetQuery} from "metabase/meta/types/Card";
import Question from "metabase-lib/lib/Question";
import {StructuredDatasetQuery} from "metabase/meta/types/Card";
import {AggregationClause, BreakoutClause} from "metabase/meta/types/Query";
// import {WrappedDatasetQuery} from "metabase/meta/types/Card";

const WRAPPED_QUERY_TEMPLATE: StructuredDatasetQuery = {
  type: "wrapped",
  database: null,
  // source_query: NativeDatasetQuery | StructuredDatasetQuery
};


export class WrappedQuery extends AtomicQuery {

  static isDatasetQueryType(datasetQuery: DatasetQuery): boolean {
    return datasetQuery.type === WRAPPED_QUERY_TEMPLATE.type;
  }

  constructor(
    question: Question,
    datasetQuery: DatasetQuery,
    aggregation: AggregationClause,
    breakout: BreakoutClause,
  ) {
    super(question, wrapQuery(datasetQuery, aggregation, breakout));
  }


}

const wrapQuery = (query: DatasetQuery,     aggregation: AggregationClause,
                   breakout: BreakoutClause) : WrappedDatasetQuery =>{
  if(query.type === 'wrapped')
    return query;

  return {...query, native : undefined,  type: 'query', query: { source_table: query.native || query.query, aggregation, breakout }};

};
