import React, { HTMLAttributes } from "react";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonImage, SkeletonRoot } from "./ScalarSkeleton.styled";

export interface ScalarSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
}

const ScalarSkeleton = ({
  name,
  description,
  ...props
}: ScalarSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonImage xmlns="http://www.w3.org/2000/svg" viewBox="0 0 103 32">
        <rect width="103" height="32" rx="16" fill="currentColor" />
      </SkeletonImage>
      <SkeletonCaption name={name} description={description} />
    </SkeletonRoot>
  );
};

export default ScalarSkeleton;
