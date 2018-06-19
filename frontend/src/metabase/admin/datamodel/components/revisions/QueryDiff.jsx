import React, { Component } from "react";
import PropTypes from "prop-types";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import FilterList from "metabase/query_builder/components/FilterList.jsx";
import AggregationWidget from "metabase/query_builder/components/AggregationWidget.jsx";

import Query from "metabase/lib/query";

export default class QueryDiff extends Component {
  static propTypes = {
    diff: PropTypes.object.isRequired,
    tableMetadata: PropTypes.object.isRequired,
  };

  render() {
    const { diff: { before, after }, tableMetadata } = this.props;
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
