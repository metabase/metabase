import React, { HTMLAttributes } from "react";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonRoot } from "./EmptySkeleton.styled";

export interface EmptySkeletonProps extends HTMLAttributes<HTMLDivElement> {
  displayName?: string | null;
  description?: string | null;
}

const EmptySkeleton = ({
  displayName,
  description,
  ...props
}: EmptySkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={displayName} description={description} />
    </SkeletonRoot>
  );
};

export default EmptySkeleton;
