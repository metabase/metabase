import React from "react";
import {
  SkeletonIcon,
  SkeletonTitle,
  SkeletonDescription,
} from "./StaticSkeleton.styled";

export interface StaticSkeletonProps {
  displayName?: string;
  description?: string;
  icon?: StaticSkeletonIconProps;
}

export interface StaticSkeletonIconProps {
  name: string;
}

const StaticSkeleton = ({
  displayName,
  description,
  icon,
}: StaticSkeletonProps): JSX.Element => {
  return (
    <div>
      {icon && <SkeletonIcon {...icon} />}
      <SkeletonTitle>{displayName}</SkeletonTitle>
      {description && <SkeletonDescription>{description}</SkeletonDescription>}
    </div>
  );
};

export default StaticSkeleton;
