import React from "react";
import { SkeletonRoot, SkeletonTitle } from "./SkeletonCaption.styled";

export interface SkeletonCaptionProps {
  name?: string;
}

const SkeletonCaption = ({ name }: SkeletonCaptionProps): JSX.Element => {
  return (
    <SkeletonRoot>
      <SkeletonTitle>{name}</SkeletonTitle>
    </SkeletonRoot>
  );
};

export default SkeletonCaption;
