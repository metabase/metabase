// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { animationStyles } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton.styled";

export const SkeletonImage = styled.svg`
  ${animationStyles};
  flex: 1 1 0;
  margin-top: 1rem;
  padding-inline-start: 0.5rem;
  padding-bottom: 0.5rem;
  border-inline-start: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
`;
