import React, { HTMLAttributes } from "react";
import {
  SkeletonBottomImage,
  SkeletonCenterCaption,
  SkeletonRoot,
  SkeletonTopImage,
} from "./SmartScalarSkeleton.styled";

export interface SmartScalarSkeletonProps
  extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
}

const SmartScalarSkeleton = ({
  name,
  description,
  ...props
}: SmartScalarSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonTopImage xmlns="http://www.w3.org/2000/svg" viewBox="0 0 103 32">
        <rect width="103" height="32" rx="16" fill="currentColor" />
      </SkeletonTopImage>
      <SkeletonCenterCaption
        name={name}
        description={description}
        size="large"
      />
      <SkeletonBottomImage
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SmartScalarSkeleton;
