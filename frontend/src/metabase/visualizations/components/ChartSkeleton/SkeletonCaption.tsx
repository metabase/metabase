import React from "react";
import { SkeletonTitle } from "./SkeletonCaption.styled";

export interface SkeletonCaptionProps {
  name?: string;
}

const SkeletonCaption = ({ name }: SkeletonCaptionProps): JSX.Element => {
  return (
    <div>
      <SkeletonTitle>{name}</SkeletonTitle>
    </div>
  );
};

export default SkeletonCaption;
