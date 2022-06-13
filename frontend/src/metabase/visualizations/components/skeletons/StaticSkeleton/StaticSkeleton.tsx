import React from "react";
import {
  SkeletonDescription,
  SkeletonIcon,
  SkeletonRoot,
  SkeletonTitle,
} from "./StaticSkeleton.styled";

export interface StaticSkeletonProps {
  name?: string | null;
  description?: string | null;
  icon?: StaticSkeletonIconProps;
}

export interface StaticSkeletonIconProps {
  name: string;
}

const StaticSkeleton = ({
  name,
  description,
  icon,
}: StaticSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot>
      {icon && <SkeletonIcon {...icon} />}
      <SkeletonTitle>{name}</SkeletonTitle>
      {description && <SkeletonDescription>{description}</SkeletonDescription>}
    </SkeletonRoot>
  );
};

export default StaticSkeleton;
