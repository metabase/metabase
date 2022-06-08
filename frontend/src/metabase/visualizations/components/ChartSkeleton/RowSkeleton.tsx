import React from "react";
import { SkeletonRoot, SkeletonRow } from "./RowSkeleton.styled";

const ROWS = [34, 78, 60, 93, 19];

const RowSkeleton = (): JSX.Element => {
  return (
    <SkeletonRoot>
      {ROWS.map((width, index) => (
        <SkeletonRow key={index} style={{ width: `${width}%` }} />
      ))}
    </SkeletonRoot>
  );
};

export default RowSkeleton;
