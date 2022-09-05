import React, { HTMLAttributes } from "react";
import { SkeletonRoot, SkeletonImage } from "./RowSkeleton.styled";
import SkeletonCaption from "../SkeletonCaption";

export interface RowSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
}

const RowSkeleton = ({
  name,
  description,
  ...props
}: RowSkeletonProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      <SkeletonCaption name={name} description={description} />
      <SkeletonImage
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 346 130"
        preserveAspectRatio="none"
      >
        <path
          fill="currentColor"
          d="M293 27v22H0V27zM224 54v22H0V54zM346 81v22H0V81zM73 108v22H0v-22zM129 0v22H0V0z"
        />
      </SkeletonImage>
    </SkeletonRoot>
  );
};

export default RowSkeleton;
