import { HTMLAttributes } from "react";
import Tooltip from "metabase/core/components/Tooltip";
import { SkeletonRootProps } from "metabase/visualizations/components/skeletons/Skeleton/Skeleton";
import {
  SkeletonCaptionRoot,
  SkeletonCaptionTitle,
  SkeletonCaptionDescription,
  SkeletonPlaceholder,
} from "./SkeletonCaption.styled";
import { SkeletonCaptionSize } from "./types";

export type SkeletonCaptionProps = HTMLAttributes<HTMLDivElement> &
  SkeletonRootProps & {
    size?: SkeletonCaptionSize;
  };

const SkeletonCaption = ({
  name,
  description,
  actionMenu,
  size = "medium",
  ...props
}: SkeletonCaptionProps): JSX.Element => {
  return (
    <SkeletonCaptionRoot {...props}>
      {name ? (
        <SkeletonCaptionTitle size={size}>{name}</SkeletonCaptionTitle>
      ) : (
        <SkeletonPlaceholder />
      )}
      <div style={{ display: "flex", alignItems: "center" }}>
        {description && (
          <Tooltip tooltip={description} maxWidth="22em">
            <SkeletonCaptionDescription name="info" />
          </Tooltip>
        )}
        {actionMenu}
      </div>
    </SkeletonCaptionRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SkeletonCaption, {
  Title: SkeletonCaptionTitle,
  Description: SkeletonCaptionDescription,
});
