import React from "react";
import { percentage } from "./utils";
import { SkeletonRoot, SkeletonColumn } from "./BarSkeleton.styled";

const COLUMNS = [
  0.56,
  0.69,
  0.56,
  0.84,
  0.69,
  0.65,
  0.76,
  0.69,
  0.69,
  0.76,
  0.69,
  0.69,
  0.76,
];
const DENSITY = 0.8;

const BarSkeleton = (): JSX.Element => {
  return (
    <SkeletonRoot>
      {COLUMNS.map((height, index) => (
        <SkeletonColumn
          key={index}
          style={{
            width: percentage(DENSITY / COLUMNS.length),
            height: percentage(height),
          }}
        />
      ))}
    </SkeletonRoot>
  );
};

export default BarSkeleton;
