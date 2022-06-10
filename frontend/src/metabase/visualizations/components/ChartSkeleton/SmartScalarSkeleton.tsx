import React, { HTMLAttributes } from "react";
import SkeletonCaption from "./SkeletonCaption";
import {
  SkeletonContainer,
  SkeletonImage,
  SkeletonRoot,
} from "./SmartScalarSkeleton.styled";

export interface SmartScalarSkeletonProps
  extends HTMLAttributes<HTMLDivElement> {
  displayName?: string | null;
}

const SmartScalarSkeleton = ({
  displayName,
  ...props
}: SmartScalarSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      {displayName && <SkeletonCaption name={displayName} />}
      <SkeletonImage
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 182 8"
        height="8"
      >
        <circle cx="47.121" cy="4.5" r="2" fill="currentColor" />
        <rect x="56" width="126" height="8" rx="4" fill="currentColor" />
        <rect width="38" height="8" rx="4" fill="currentColor" />
      </SkeletonImage>
    </SkeletonRoot>
  );
};

export default SmartScalarSkeleton;
