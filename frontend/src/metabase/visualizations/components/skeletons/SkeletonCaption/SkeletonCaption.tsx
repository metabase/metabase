import React, { HTMLAttributes } from "react";
import { Tooltip } from "metabase/core/components/Tooltip";
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SkeletonCaption, {
  Title: SkeletonTitle,
  Description: SkeletonDescription,
});
