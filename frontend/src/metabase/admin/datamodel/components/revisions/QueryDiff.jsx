import React, { Component } from "react";
import PropTypes from "prop-types";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import FilterList from "metabase/query_builder/components/FilterList";
import AggregationWidget from "metabase/query_builder/components/AggregationWidget";

import * as Query from "metabase/lib/query/query";

export default class QueryDiff extends Component {
  static propTypes = {
    diff: PropTypes.object.isRequired,
    tableMetadata: PropTypes.object.isRequired,
  };

  render() {
    const {
      diff: { before, after },
      tableMetadata,
    } = this.props;
    const defintion = after || before;

    const filters = Query.getFilters(defintion);

    return (
      <LoadingAndErrorWrapper loading={!tableMetadata}>
        {() => (
          <div className="my1" style={{ pointerEvents: "none" }}>
            {defintion.aggregation && (
              <AggregationWidget
                aggregation={defintion.aggregation}
                tableMetadata={tableMetadata}
              />
            )}
            {filters.length > 0 && (
              <FilterList filters={filters} maxDisplayValues={Infinity} />
            )}
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
