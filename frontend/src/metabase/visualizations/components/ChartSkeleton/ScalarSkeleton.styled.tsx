import styled from "@emotion/styled";
import { containerStyles, animationStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  ${containerStyles};
  justify-content: center;
  align-items: center;
`;

export const SkeletonImage = styled.svg`
  ${animationStyles};
  height: 2rem;
  margin-bottom: 1rem;
`;
