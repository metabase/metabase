import React from "react";

import ColumnDragSource from "./dnd/ColumnDragSource";
import ColumnItem from "./ColumnItem";

const MetricList = ({ className, style, query }) => {
  const metrics = query.table().metrics;
  return (
    <div className={className} style={style}>
      <div className="text-uppercase text-small text-bold text-medium px2 my1">
        Common Metrics
      </div>
      {metrics.map(metric => (
        <ColumnDragSource metric={metric}>
          <ColumnItem icon="star" className="text-accent2">
            {metric.name}
          </ColumnItem>
        </ColumnDragSource>
      ))}
    </div>
  );
};
export default MetricList;
