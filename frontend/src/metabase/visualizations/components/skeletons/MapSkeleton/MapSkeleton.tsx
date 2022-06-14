import React, { HTMLAttributes } from "react";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonImage, SkeletonRoot } from "./MapSkeleton.styled";

export interface MapSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  displayName?: string | null;
  description?: string | null;
}

const MapSkeleton = ({
  displayName,
  description,
  ...props
}: MapSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={displayName} description={description} />
      <SkeletonImage
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
