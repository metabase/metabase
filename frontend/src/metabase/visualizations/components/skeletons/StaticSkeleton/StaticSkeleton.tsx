import React, { HTMLAttributes } from "react";
import {
  SkeletonDescription,
  SkeletonIcon,
  SkeletonTitle,
} from "./StaticSkeleton.styled";

export interface StaticSkeletonProps extends HTMLAttributes<HTMLDivElement> {
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
  ...props
}: StaticSkeletonProps): JSX.Element => {
  return (
    <div {...props}>
      {icon && <SkeletonIcon {...icon} />}
      <SkeletonTitle>{name}</SkeletonTitle>
      {description && <SkeletonDescription>{description}</SkeletonDescription>}
    </div>
  );
};

export default StaticSkeleton;
