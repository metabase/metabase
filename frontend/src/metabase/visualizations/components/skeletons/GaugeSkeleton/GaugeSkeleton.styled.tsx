import styled from "@emotion/styled";

import { getAnimationStyles } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton.styled";

export const SkeletonImage = styled.svg`
  ${({ theme }) => getAnimationStyles(theme)};
  flex: 1 1 0;
  margin-top: 1.25rem;
  margin-bottom: 0.625rem;
`;
