import cx from "classnames";
import type { HTMLAttributes, JSX } from "react";

import { Box } from "metabase/ui";
import VisualizationS from "metabase/visualizations/components/Visualization/Visualization.module.css";
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
    <Box className={cx(VisualizationS.root, className)}>
      <VisualizationSkeletonCaption
        name={name}
        description={description}
        actionMenu={actionMenu}
      />
      {children}
    </Box>
  );
};
