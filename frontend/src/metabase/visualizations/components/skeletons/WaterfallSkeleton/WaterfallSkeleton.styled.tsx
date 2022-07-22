import styled from "@emotion/styled";
import { containerStyles, animationStyles } from "../Skeleton";

export const SkeletonRoot = styled.div`
  ${containerStyles};
`;

export const SkeletonImage = styled.svg`
  ${animationStyles};
  flex: 1 1 0;
  margin-top: 1rem;
`;
