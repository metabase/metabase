import type { HTMLAttributes } from "react";

import { Flex } from "metabase/ui";
import { VisualizationSkeletonCaption } from "metabase/visualizations/components/skeletons/VisualizationSkeleton/VisualizationSkeleton.styled";

export type VisualizationSkeletonProps = HTMLAttributes<HTMLDivElement> & {
  name?: string | null;
  description?: string | null;
  actionMenu?: JSX.Element | null;
};

export const VisualizationSkeleton = ({
  name,
  description,
  actionMenu,
  children,
  className,
}: VisualizationSkeletonProps) => {
  return (
    <Flex direction="column" h="100%" className={className}>
      <VisualizationSkeletonCaption
        name={name}
        description={description}
        actionMenu={actionMenu}
      />
      {children}
    </Flex>
  );
};
