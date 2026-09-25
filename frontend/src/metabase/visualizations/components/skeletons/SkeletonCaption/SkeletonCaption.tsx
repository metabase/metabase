import type { HTMLAttributes } from "react";

import { Markdown } from "metabase/common/components/Markdown";
import { Ellipsified, Flex, Tooltip } from "metabase/ui";
import {
  LegendDescriptionIcon,
  LegendRightContent,
} from "metabase/visualizations/components/legend/LegendCaption/LegendCaption.styled";
import type { VisualizationSkeletonProps } from "metabase/visualizations/components/skeletons/VisualizationSkeleton/VisualizationSkeleton";

export type SkeletonCaptionProps = HTMLAttributes<HTMLDivElement> &
  VisualizationSkeletonProps;

const SkeletonCaption = ({
  name,
  description,
  actionMenu,
  className,
}: SkeletonCaptionProps): JSX.Element => {
  return (
    <Flex className={className} justify="center" align="center" w="100%">
      {name && (
        <Ellipsified c="text-primary" fw="bold">
          {name}
        </Ellipsified>
      )}
      <LegendRightContent>
        {description && (
          <Tooltip
            maw="22em"
            label={
              <Markdown dark compact disallowHeading unstyleLinks lineClamp={8}>
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
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SkeletonCaption;
