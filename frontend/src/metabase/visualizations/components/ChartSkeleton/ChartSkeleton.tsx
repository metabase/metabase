import React from "react";
import AreaSkeleton from "./AreaSkeleton";
import BarSkeleton from "./BarSkeleton";
import LineSkeleton from "./LineSkeleton";
import RowSkeleton from "./RowSkeleton";
import ScatterSkeleton from "./ScatterSkeleton";
import TableSkeleton from "./TableSkeleton";
import WaterfallSkeleton from "./WaterfallSkeleton";

export interface ChartSkeletonProps {
  display?: string;
}

const ChartSkeleton = ({ display }: ChartSkeletonProps): JSX.Element => {
  switch (display) {
    case "area":
      return <AreaSkeleton />;
    case "bar":
      return <BarSkeleton />;
    case "line":
      return <LineSkeleton />;
    case "row":
      return <RowSkeleton />;
    case "scatter":
      return <ScatterSkeleton />;
    case "table":
      return <TableSkeleton />;
    case "waterfall":
      return <WaterfallSkeleton />;
    default:
      return <LineSkeleton />;
  }
};

export default ChartSkeleton;
