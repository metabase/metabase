import React, { HTMLAttributes } from "react";
import Tooltip from "metabase/components/Tooltip";
import {
  SkeletonRoot,
  SkeletonTitle,
  SkeletonDescription,
  SkeletonPlaceholder,
} from "./SkeletonCaption.styled";
import { SkeletonCaptionSize } from "./types";

export interface SkeletonCaptionProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
  size?: SkeletonCaptionSize;
}

const SkeletonCaption = ({
  name,
  description,
  size = "medium",
  ...props
}: SkeletonCaptionProps): JSX.Element => {
  return (
    <SkeletonRoot {...props}>
      {name ? (
        <SkeletonTitle size={size}>{name}</SkeletonTitle>
      ) : (
        <SkeletonPlaceholder />
      )}
      {description && (
        <Tooltip tooltip={description} maxWidth="22em">
          <SkeletonDescription name="info" />
        </Tooltip>
      )}
    </SkeletonRoot>
  );
};

export default Object.assign(SkeletonCaption, {
  Title: SkeletonTitle,
  Description: SkeletonDescription,
});
