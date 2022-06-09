import React from "react";
import BarSkeleton from "./BarSkeleton";
import RowSkeleton from "./RowSkeleton";
import ScatterSkeleton from "./ScatterSkeleton";
import TableSkeleton from "./TableSkeleton";
import WaterfallSkeleton from "./WaterfallSkeleton";

export interface ChartSkeletonProps {
  display?: string;
}

const ChartSkeleton = ({ display }: ChartSkeletonProps): JSX.Element => {
  switch (display) {
    case "bar":
      return <BarSkeleton />;
    case "row":
      return <RowSkeleton />;
    case "scatter":
      return <ScatterSkeleton />;
    case "table":
      return <TableSkeleton />;
    case "waterfall":
      return <WaterfallSkeleton />;
    default:
      return <RowSkeleton />;
  }
};

export default ChartSkeleton;
