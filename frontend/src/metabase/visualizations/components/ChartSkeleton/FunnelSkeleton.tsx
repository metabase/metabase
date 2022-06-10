import React, { HTMLAttributes } from "react";
import SkeletonCaption from "./SkeletonCaption";
import { SkeletonImage, SkeletonRoot } from "./FunnelSkeleton.styled";

export interface AreaSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  displayName?: string | null;
}

const AreaSkeleton = ({
  displayName,
  ...props
}: AreaSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      {displayName && <SkeletonCaption name={displayName} />}
      <SkeletonImage
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 370 104"
        preserveAspectRatio="xMidYMid"
      >
        <path
          d="m0 0 123 24v56L0 104V0ZM124 24l122 16v32l-122 8V24ZM247 40l123 8v15l-123 9V40Z"
          fill="currentColor"
        />
      </SkeletonImage>
    </SkeletonRoot>
  );
};

export default AreaSkeleton;
