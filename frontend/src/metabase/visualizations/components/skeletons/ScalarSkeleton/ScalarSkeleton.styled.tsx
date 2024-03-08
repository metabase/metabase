import styled from "@emotion/styled";

import { VisualizationRoot } from "metabase/visualizations/components/Visualization/Visualization.styled";
import { animationStyles } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton.styled";
import SkeletonCaption from "metabase/visualizations/components/skeletons/SkeletonCaption";

export const PositionedActionMenu = styled.div`
  position: absolute;
  top: 0.3125rem;
  right: 0.3125rem;
  z-index: 3;
  color: #6e7680;
  visibility: hidden;
`;
export const SkeletonRoot = styled(VisualizationRoot)`
  justify-content: center;
  align-items: center;
`;
export const SkeletonTopImage = styled.svg`
  ${animationStyles};
  height: 2rem;
  margin-top: 0.625rem;
`;
export const SkeletonBottomImage = styled.svg`
  ${animationStyles};
  height: 0.5rem;
`;
export const SkeletonCenterCaption = styled(SkeletonCaption)`
  margin-top: 0.25rem;
  margin-bottom: 2.25rem;
`;
