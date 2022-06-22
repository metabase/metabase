import React, { HTMLAttributes } from "react";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonRoot, SkeletonImage } from "./ScatterSkeleton.styled";

export interface ScatterSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
}

const ScatterSkeleton = ({
  name,
  description,
  ...props
}: ScatterSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={name} description={description} />
      <SkeletonImage
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 340 119"
        preserveAspectRatio="xMidYMid"
      >
        <circle cx="11" cy="58" r="11" fill="currentColor" />
        <circle cx="88" cy="58" r="26" fill="currentColor" />
        <circle cx="208" cy="29" r="21" fill="currentColor" />
        <circle cx="301.5" cy="80.5" r="38.5" fill="currentColor" />
        <circle cx="11" cy="20" r="6" fill="currentColor" />
        <circle cx="82" cy="4" r="4" fill="currentColor" />
        <circle cx="298" cy="4" r="4" fill="currentColor" />
        <circle cx="141" cy="15" r="11" fill="currentColor" />
        <circle cx="141" cy="87" r="16" fill="currentColor" />
      </SkeletonImage>
    </SkeletonRoot>
  );
};

export default ScatterSkeleton;
