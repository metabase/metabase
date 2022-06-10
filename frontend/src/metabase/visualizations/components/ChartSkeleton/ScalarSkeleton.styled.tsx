import styled from "@emotion/styled";
import { containerStyles, imageStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  ${containerStyles};
  justify-content: center;
  align-items: center;
`;

export const SkeletonImage = styled.svg`
  ${imageStyles};
  height: 2rem;
  margin-bottom: 1rem;
`;
