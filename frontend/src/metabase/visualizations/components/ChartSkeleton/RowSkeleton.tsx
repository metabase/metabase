import React from "react";
import { percentage } from "./utils";
import { SkeletonRoot, SkeletonRow } from "./RowSkeleton.styled";

const ROWS = [0.34, 0.78, 0.6, 0.93, 0.19];
const DENSITY = 0.8;

const RowSkeleton = (): JSX.Element => {
  return (
    <SkeletonRoot>
      {ROWS.map((width, index) => (
        <SkeletonRow
          key={index}
          style={{
            width: percentage(width),
            height: percentage(DENSITY / ROWS.length),
          }}
        />
      ))}
    </SkeletonRoot>
  );
};

export default RowSkeleton;
