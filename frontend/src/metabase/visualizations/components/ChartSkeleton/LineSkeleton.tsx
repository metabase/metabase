import React, { HTMLAttributes } from "react";
import SkeletonCaption from "./SkeletonCaption";
import { SkeletonRoot, SkeletonImage } from "./AreaSkeleton.styled";

export interface LineSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
}

const LineSkeleton = ({ name, ...props }: LineSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      {name && <SkeletonCaption name={name} />}
      <SkeletonImage
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 371 113"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="m1 111 15.336-10 18.043 10 22.553-16.5 15.336 9.5 46.91-47 30.331 16 31.013-16 20.299 16 43.752-41 24.358 31 15.273-15.5L299.603 63l48.714-60L374 63"
          stroke="currentColor"
          strokeWidth="3"
        />
      </SkeletonImage>
    </SkeletonRoot>
  );
};

export default LineSkeleton;
