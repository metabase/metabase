import React from "react";
import RowSkeleton from "./RowSkeleton";
import TableSkeleton from "./TableSkeleton";

export interface ChartSkeletonProps {
  display?: string;
}

const ChartSkeleton = ({ display }: ChartSkeletonProps): JSX.Element => {
  switch (display) {
    case "row":
      return <RowSkeleton />;
    case "table":
      return <TableSkeleton />;
    default:
      return <RowSkeleton />;
  }
};

export default ChartSkeleton;
