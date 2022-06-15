import React, { HTMLAttributes } from "react";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonImage, SkeletonRoot } from "./PieSkeleton.styled";

export interface PieSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
}

const PieSkeleton = ({
  name,
  description,
  ...props
}: PieSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={name} description={description} />
      <SkeletonImage
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 432 138"
        fill="none"
        preserveAspectRatio="xMidYMid"
      >
        <rect y="24" width="80" height="11" rx="5.5" fill="currentColor" />
        <rect y="50" width="80" height="11" rx="5.5" fill="currentColor" />
        <rect y="76" width="80" height="11" rx="5.5" fill="currentColor" />
        <rect y="102" width="80" height="11" rx="5.5" fill="currentColor" />
        <path
          d="M 302 12 a 56.998 56.998 0 0 1 56.961 54.888 M 359 69 a 56.992 56.992 0 0 1 -16.695 40.305 A 56.986 56.986 0 0 1 302 126 M 300.011 125.965 A 56.999 56.999 0 0 1 245 69.123 M 245.035 67.01 a 57 57 0 0 1 55.373 -54.988"
          stroke="currentColor"
          strokeWidth="24"
        />
      </SkeletonImage>
    </SkeletonRoot>
  );
};

export default PieSkeleton;
