import { HTMLAttributes } from "react";
import SkeletonCaption from "metabase/visualizations/components/skeletons/SkeletonCaption/SkeletonCaption";
import { VisualizationRoot } from "metabase/visualizations/components/Visualization/Visualization.styled";

export type SkeletonRootProps = HTMLAttributes<HTMLDivElement> & {
  name?: string | null;
  description?: string | null;
  actionMenu?: JSX.Element | null;
};

export const Skeleton = ({
  name,
  description,
  actionMenu,
  children,
  ...props
}: SkeletonRootProps) => {
  return (
    <VisualizationRoot {...props}>
      <SkeletonCaption
        name={name}
        description={description}
        actionMenu={actionMenu}
      />
      {children}
    </VisualizationRoot>
  );
};
