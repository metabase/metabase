import React, { HTMLAttributes } from "react";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonImage, SkeletonRoot } from "./MapSkeleton.styled";

export interface MapSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
}

const MapSkeleton = ({
  name,
  description,
  ...props
}: MapSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={name} description={description} />
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MapSkeleton;
