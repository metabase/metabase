import type { HTMLAttributes } from "react";

import { VisualizationRoot } from "metabase/visualizations/components/Visualization/Visualization.styled";
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
    <VisualizationRoot className={className}>
      <VisualizationSkeletonCaption
        name={name}
        description={description}
        actionMenu={actionMenu}
      />
      {children}
    </VisualizationRoot>
  );
};
