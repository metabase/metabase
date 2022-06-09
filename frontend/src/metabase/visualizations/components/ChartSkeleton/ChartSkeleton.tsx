import React, { HTMLAttributes } from "react";
import AreaSkeleton from "./AreaSkeleton";
import BarSkeleton from "./BarSkeleton";

export interface ChartSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  display?: string;
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
    default:
      return <AreaSkeleton {...props} />;
  }
};

export default ChartSkeleton;
