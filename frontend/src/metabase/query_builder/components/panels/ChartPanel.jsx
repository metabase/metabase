import React from "react";

import ColumnList from "../visualize/ColumnList";
import MetricList from "../visualize/MetricList";

export default class ChartPanel extends React.Component {
  render() {
    const { query, rawSeries } = this.props;
    return (
      <div className="p2">
        <MetricList query={query} rawSeries={rawSeries} />
        <ColumnList query={query} rawSeries={rawSeries} />
      </div>
    );
  }
}
