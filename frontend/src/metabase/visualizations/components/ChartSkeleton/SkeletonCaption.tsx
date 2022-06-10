import React from "react";
import Tooltip from "metabase/components/Tooltip";
import {
  SkeletonRoot,
  SkeletonTitle,
  SkeletonDescription,
  SkeletonPlaceholder,
} from "./SkeletonCaption.styled";

export interface SkeletonCaptionProps {
  name?: string | null;
  description?: string | null;
}

const SkeletonCaption = ({
  name,
  description,
}: SkeletonCaptionProps): JSX.Element => {
  return (
    <SkeletonRoot>
      {name ? <SkeletonTitle>{name}</SkeletonTitle> : <SkeletonPlaceholder />}
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
