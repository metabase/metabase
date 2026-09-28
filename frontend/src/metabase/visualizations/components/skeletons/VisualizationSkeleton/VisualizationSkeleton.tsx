import type { HTMLAttributes } from "react";

import { Flex } from "metabase/ui";
import SkeletonCaption from "metabase/visualizations/components/skeletons/SkeletonCaption";

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
    <Flex className={className} direction="column" h="100%">
      <SkeletonCaption
        name={name}
        description={description}
        actionMenu={actionMenu}
      />
      {children}
    </Flex>
  );
};
