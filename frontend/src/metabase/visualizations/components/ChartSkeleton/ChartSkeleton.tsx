import React from "react";
import AreaSkeleton from "./AreaSkeleton";

export interface ChartSkeletonProps {
  name?: string;
  display?: string;
}

const ChartSkeleton = ({ name, display }: ChartSkeletonProps): JSX.Element => {
  switch (display) {
    case "area":
      return <AreaSkeleton name={name} />;
    default:
      return <AreaSkeleton name={name} />;
  }
};

export default ChartSkeleton;
