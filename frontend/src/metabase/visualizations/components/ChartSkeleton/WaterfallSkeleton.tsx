import React from "react";
import { percentage } from "./utils";
import { SkeletonRoot, SkeletonColumn } from "./WaterfallSkeleton.styled";

const COLUMNS = [
  [0, 0.52],
  [0.34, 0.3],
  [0.45, 0.11],
  [0, 0.45],
  [0, 0.64],
  [0.41, 0.3],
  [0, 0.45],
  [0, 0.18],
  [0.38, 0.26],
  [0.52, 0.19],
  [0.18, 0.46],
  [0, 0.64],
  [0.34, 0.37],
];
const DENSITY = 0.8;

const WaterfallSkeleton = (): JSX.Element => {
  return (
    <SkeletonRoot>
      {COLUMNS.map(([margin, height], index) => (
        <SkeletonColumn
          key={index}
          style={{
            width: percentage(DENSITY / COLUMNS.length),
            height: percentage(height),
            bottom: percentage(margin),
          }}
        />
      ))}
    </SkeletonRoot>
  );
};

export default WaterfallSkeleton;
