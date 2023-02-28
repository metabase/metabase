import styled from "@emotion/styled";
import SkeletonCaption from "metabase/visualizations/components/skeletons/SkeletonCaption/SkeletonCaption";
import { containerStyles, animationStyles } from "../Skeleton";

export const SkeletonRoot = styled.div`
  ${containerStyles};
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
