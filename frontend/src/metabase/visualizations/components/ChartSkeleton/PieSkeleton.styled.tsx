import styled from "@emotion/styled";
import { containerStyles, imageStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  ${containerStyles};
`;

export const SkeletonImage = styled.svg`
  ${imageStyles};
  flex: 1 1 0;
`;
