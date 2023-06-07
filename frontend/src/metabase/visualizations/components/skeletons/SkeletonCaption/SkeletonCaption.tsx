import { HTMLAttributes } from "react";
import Tooltip from "metabase/core/components/Tooltip";
import { VisualizationActionButtonsContainer } from "metabase/visualizations/components/Visualization/Visualization.styled";
import { VisualizationSkeletonProps } from "metabase/visualizations/components/skeletons/VisualizationSkeleton/VisualizationSkeleton";
import {
  SkeletonCaptionRoot,
  SkeletonCaptionTitle,
  SkeletonCaptionDescription,
  SkeletonPlaceholder,
} from "./SkeletonCaption.styled";
import { SkeletonCaptionSize } from "./types";

export type SkeletonCaptionProps = HTMLAttributes<HTMLDivElement> &
  VisualizationSkeletonProps & {
    size?: SkeletonCaptionSize;
  };

const SkeletonCaption = ({
  name,
  description,
  actionMenu,
  className,
  size = "medium",
}: SkeletonCaptionProps): JSX.Element => {
  return (
    <SkeletonCaptionRoot className={className}>
      {name ? (
        <SkeletonCaptionTitle size={size}>{name}</SkeletonCaptionTitle>
      ) : (
        <SkeletonPlaceholder />
      )}
      <VisualizationActionButtonsContainer>
        {description && (
          <Tooltip tooltip={description} maxWidth="22em">
            <SkeletonCaptionDescription name="info" />
          </Tooltip>
        )}
        {actionMenu}
      </VisualizationActionButtonsContainer>
    </SkeletonCaptionRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SkeletonCaption, {
  Title: SkeletonCaptionTitle,
  Description: SkeletonCaptionDescription,
});
