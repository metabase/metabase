import React from "react";
import { SharedChartSkeletonProps } from "../ChartSkeleton/types";
import {
  SkeletonBottomImage,
  SkeletonCenterCaption,
  SkeletonRoot,
  SkeletonTopImage,
} from "./SmartScalarSkeleton.styled";

const SmartScalarSkeleton = ({
  name,
  description,
  isStatic,
  ...props
}: SharedChartSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonTopImage
        isStatic={isStatic}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 103 32"
      >
        <rect width="103" height="32" rx="16" fill="currentColor" />
      </SkeletonTopImage>
      <SkeletonCenterCaption
        name={name}
        description={description}
        size="large"
      />
      <SkeletonBottomImage
        isStatic={isStatic}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 182 8"
      >
        <circle cx="47.121" cy="4.5" r="2" fill="currentColor" />
        <rect x="56" width="126" height="8" rx="4" fill="currentColor" />
        <rect width="38" height="8" rx="4" fill="currentColor" />
      </SkeletonBottomImage>
    </SkeletonRoot>
  );
};

export default SmartScalarSkeleton;
