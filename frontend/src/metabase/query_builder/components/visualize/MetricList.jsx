import React from "react";

import ColumnDragSource from "./dnd/ColumnDragSource";
import ColumnItem from "./ColumnItem";

import { formatColumn } from "metabase/lib/formatting";
import { stripNamedClause } from "metabase/lib/query/named";
import _ from "underscore";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

const MetricList = ({ className, style, query, rawSeries }) => {
  if (!query.table()) {
    return null;
  }

  const computedSettings = rawSeries
    ? getComputedSettingsForSeries(rawSeries)
    : {};

  let cols;
  if (!query.isRaw()) {
    cols = computedSettings["_column_list"] || [];
  }

  const showCount = !_.any(
    query.aggregations(),
    agg => stripNamedClause(agg)[0] === "count",
  );
  const metrics = query.table().metrics;

  return (
    <div className={className} style={style}>
      {showCount && (
        <ColumnDragSource aggregation={["count"]}>
          <ColumnItem icon={"sum"}>{`Count`}</ColumnItem>
        </ColumnDragSource>
      )}
      {cols &&
        cols.filter(col => col.source === "aggregation").map(col => (
          <ColumnDragSource column={col}>
            <ColumnItem icon={"sum"}>{formatColumn(col)}</ColumnItem>
          </ColumnDragSource>
        ))}
      <div className="text-uppercase text-small text-bold text-medium px2 my1">
        Common Metrics
      </div>
      {metrics.map(metric => (
        <ColumnDragSource aggregation={["metric", metric.id]}>
          <ColumnItem icon="star" className="text-accent2">
            {metric.name}
          </ColumnItem>
        </ColumnDragSource>
      ))}
    </div>
  );
};
export default MetricList;
