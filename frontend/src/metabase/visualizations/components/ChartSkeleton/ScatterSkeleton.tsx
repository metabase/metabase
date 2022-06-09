import React from "react";
import { percentage } from "./utils";
import { SkeletonRoot, SkeletonCircle } from "./ScatterSkeleton.styled";

const CIRCLES = [
  [0.08, 0.503, 0.059],
  [0.08, 0.222, 0.032],
];

const ScatterSkeleton = (): JSX.Element => {
  return (
    <SkeletonRoot>
      {CIRCLES.map(([x, y, radius], index) => (
        <SkeletonCircle
          key={index}
          style={{
            top: percentage(y),
            left: percentage(x),
            width: percentage(radius),
            paddingBottom: percentage(radius),
          }}
        />
      ))}
    </SkeletonRoot>
  );
};

export default ScatterSkeleton;
