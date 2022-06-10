import React, { HTMLAttributes } from "react";
import AreaSkeleton from "./AreaSkeleton";
import BarSkeleton from "./BarSkeleton";
import LineSkeleton from "./LineSkeleton";
import RowSkeleton from "./RowSkeleton";
import ScatterSkeleton from "./ScatterSkeleton";
import TableSkeleton from "./TableSkeleton";
import WaterfallSkeleton from "./WaterfallSkeleton";

export interface ChartSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  display?: string | null;
  displayName?: string | null;
}

const ChartSkeleton = ({
  display,
  ...props
}: ChartSkeletonProps): JSX.Element => {
  switch (display) {
    case "area":
      return <AreaSkeleton {...props} />;
    case "bar":
      return <BarSkeleton {...props} />;
    case "line":
      return <LineSkeleton {...props} />;
    case "row":
      return <RowSkeleton {...props} />;
    case "scatter":
      return <ScatterSkeleton {...props} />;
    case "table":
    case "pivot":
      return <TableSkeleton {...props} />;
    case "waterfall":
      return <WaterfallSkeleton {...props} />;
    default:
      return <LineSkeleton {...props} />;
  }
};

export default ChartSkeleton;
