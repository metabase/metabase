import React from "react";
import Tooltip from "metabase/components/Tooltip";
import {
  SkeletonRoot,
  SkeletonTitle,
  SkeletonIcon,
} from "./SkeletonCaption.styled";

export interface SkeletonCaptionProps {
  name: string;
  description?: string | null;
}

const SkeletonCaption = ({
  name,
  description,
}: SkeletonCaptionProps): JSX.Element => {
  return (
    <SkeletonRoot>
      <SkeletonTitle>{name}</SkeletonTitle>
      {description && (
        <Tooltip tooltip={description} maxWidth="22em">
          <SkeletonIcon name="info" />
        </Tooltip>
      )}
    </SkeletonRoot>
  );
};

export default SkeletonCaption;
