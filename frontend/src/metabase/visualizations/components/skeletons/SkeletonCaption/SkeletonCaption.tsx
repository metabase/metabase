import type { HTMLAttributes } from "react";

import { Markdown } from "metabase/common/components/Markdown";
import { Tooltip } from "metabase/ui";
import {
  LegendDescriptionIcon,
  LegendRightContent,
} from "metabase/visualizations/components/legend/LegendCaption/LegendCaption.styled";
import type { VisualizationSkeletonProps } from "metabase/visualizations/components/skeletons/VisualizationSkeleton/VisualizationSkeleton";

import {
  SkeletonCaptionDescription,
  SkeletonCaptionRoot,
  SkeletonCaptionTitle,
} from "./SkeletonCaption.styled";
import type { SkeletonCaptionSize } from "./types";

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
      {name && <SkeletonCaptionTitle size={size}>{name}</SkeletonCaptionTitle>}
      <LegendRightContent>
        {description && (
          <Tooltip
            maw="22em"
            label={
              <Markdown dark disallowHeading unstyleLinks>
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
