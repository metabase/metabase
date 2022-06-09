import React from "react";
import { percentage } from "./utils";
import { SkeletonRoot, SkeletonCircle } from "./ScatterSkeleton.styled";

const CIRCLES = [
  [0.081, 0.222, 0.032],
  [0.081, 0.622, 0.059],
  [0.272, 0.104, 0.022],
  [0.288, 0.504, 0.14],
  [0.431, 0.185, 0.059],
  [0.431, 0.719, 0.086],
  [0.612, 0.289, 0.113],
  [0.854, 0.104, 0.022],
  [0.862, 0.666, 0.207],
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
