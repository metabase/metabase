import React from "react";
import RowSkeleton from "./RowSkeleton";

export interface ChartSkeletonProps {
  display?: string;
}

const ChartSkeleton = ({ display }: ChartSkeletonProps): JSX.Element => {
  return <RowSkeleton />;
};

export default ChartSkeleton;
