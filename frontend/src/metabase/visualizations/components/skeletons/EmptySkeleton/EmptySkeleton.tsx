import React, { HTMLAttributes } from "react";
import SkeletonCaption from "../SkeletonCaption";
import { SkeletonRoot } from "./EmptySkeleton.styled";

export interface EmptySkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
}

const EmptySkeleton = ({
  name,
  description,
  ...props
}: EmptySkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={name} description={description} />
    </SkeletonRoot>
  );
};

export default EmptySkeleton;
