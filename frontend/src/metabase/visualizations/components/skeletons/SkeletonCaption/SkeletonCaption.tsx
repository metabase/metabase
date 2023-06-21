import { HTMLAttributes } from "react";
import Markdown from "metabase/core/components/Markdown";
import Tooltip from "metabase/core/components/Tooltip";
import { VisualizationSkeletonProps } from "metabase/visualizations/components/skeletons/VisualizationSkeleton/VisualizationSkeleton";
import {
  LegendDescriptionIcon,
  LegendRightContent,
} from "metabase/visualizations/components/legend/LegendCaption.styled";
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
      <LegendRightContent>
        {description && (
          <Tooltip
            maxWidth="22em"
            tooltip={
              <Markdown disallowHeading unstyleLinks>
                {description}
              </Markdown>
            }
          >
            <LegendDescriptionIcon
              data-testid="skeleton-description-icon"
              name="info"
            />
          </Tooltip>
        )}

        {actionMenu}
      </LegendRightContent>
    </SkeletonCaptionRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SkeletonCaption, {
  Title: SkeletonCaptionTitle,
  Description: SkeletonCaptionDescription,
});
