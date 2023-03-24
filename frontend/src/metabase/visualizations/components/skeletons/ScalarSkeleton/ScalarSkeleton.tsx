import React from "react";
import { SharedChartSkeletonProps } from "../ChartSkeleton/types";
import {
  SkeletonImage,
  SkeletonRoot,
  SkeletonCenterCaption,
} from "./ScalarSkeleton.styled";

const ScalarSkeleton = ({
  name,
  description,
  isStatic,
  ...props
}: SharedChartSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonImage
        isStatic={isStatic}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 103 32"
      >
        <rect width="103" height="32" rx="16" fill="currentColor" />
      </SkeletonImage>
      <SkeletonCenterCaption
        name={name}
        description={description}
        size="large"
      />
    </SkeletonRoot>
  );
};

export default ScalarSkeleton;
