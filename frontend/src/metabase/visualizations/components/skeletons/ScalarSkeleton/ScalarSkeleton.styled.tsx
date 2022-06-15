import styled from "@emotion/styled";
import { containerStyles, animationStyles } from "../Skeleton";
import SkeletonCaption from "../SkeletonCaption";

export const SkeletonRoot = styled.div`
  ${containerStyles};
  justify-content: center;
  align-items: center;
`;

export const SkeletonImage = styled.svg`
  ${animationStyles};
  height: 2rem;
`;

export const SkeletonCenterCaption = styled(SkeletonCaption)`
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
`;
