import React from "react";
import { SharedChartSkeletonProps } from "../ChartSkeleton/types";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonImage, SkeletonRoot } from "./MapSkeleton.styled";

const MapSkeleton = ({
  name,
  description,
  isStatic,
  ...props
}: SharedChartSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={name} description={description} />
      <SkeletonImage
        isStatic={isStatic}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 242 157"
        preserveAspectRatio="xMidYMid"
      >
        <image href="/app/assets/img/map.svg" />
      </SkeletonImage>
    </SkeletonRoot>
  );
};

export default MapSkeleton;
