import type { HTMLAttributes } from "react";

import { Markdown } from "metabase/common/components/Markdown";
import { Box, Ellipsified, Flex, Icon, Tooltip } from "metabase/ui";
import type { VisualizationSkeletonProps } from "metabase/visualizations/components/skeletons/VisualizationSkeleton/VisualizationSkeleton";

import S from "./SkeletonCaption.module.css";

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
      <Flex justify="flex-end" align="center" ml="auto">
        {description && (
          <Tooltip
            maw="22em"
            label={
              <Markdown dark compact disallowHeading unstyleLinks lineClamp={8}>
                {description}
              </Markdown>
            }
          >
            <Box
              component="span"
              className={S.descriptionIcon}
              mx="xxs"
              data-testid="skeleton-description-icon"
            >
              <Icon name="info" />
            </Box>
          </Tooltip>
        )}

        {actionMenu}
      </Flex>
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SkeletonCaption;
