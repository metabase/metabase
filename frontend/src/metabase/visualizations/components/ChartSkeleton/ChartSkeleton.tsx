import React, { HTMLAttributes } from "react";
import AreaSkeleton from "./AreaSkeleton";
import BarSkeleton from "./BarSkeleton";
import FunnelSkeleton from "./FunnelSkeleton";
import LineSkeleton from "./LineSkeleton";
import PieSkeleton from "./PieSkeleton";
import RowSkeleton from "./RowSkeleton";
import ScalarSkeleton from "./ScalarSkeleton";
import ScatterSkeleton from "./ScatterSkeleton";
import SkeletonCaption from "./SkeletonCaption";
import SmartScalarSkeleton from "./SmartScalarSkeleton";
import TableSkeleton from "./TableSkeleton";
import WaterfallSkeleton from "./WaterfallSkeleton";

export interface ChartSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  display?: string | null;
  displayName?: string | null;
  description?: string | null;
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
    case "funnel":
      return <FunnelSkeleton {...props} />;
    case "line":
      return <LineSkeleton {...props} />;
    case "pie":
      return <PieSkeleton {...props} />;
    case "pivot":
      return <TableSkeleton {...props} />;
    case "row":
      return <RowSkeleton {...props} />;
    case "scalar":
      return <ScalarSkeleton {...props} />;
    case "scatter":
      return <ScatterSkeleton {...props} />;
    case "table":
      return <TableSkeleton {...props} />;
    case "smartscalar":
      return <SmartScalarSkeleton {...props} />;
    case "waterfall":
      return <WaterfallSkeleton {...props} />;
    default:
      return <LineSkeleton {...props} />;
  }
};

export default Object.assign(ChartSkeleton, {
  Title: SkeletonCaption.Title,
  Description: SkeletonCaption.Description,
});
