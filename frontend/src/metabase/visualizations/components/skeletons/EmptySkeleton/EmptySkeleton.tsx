import React from "react";
import { SharedChartSkeletonProps } from "../ChartSkeleton/types";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonRoot } from "./EmptySkeleton.styled";

const EmptySkeleton = ({
  name,
  description,
  isStatic,
  ...props
}: SharedChartSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={name} description={description} />
    </SkeletonRoot>
  );
};

export default EmptySkeleton;
