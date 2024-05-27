import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { getAnimationStyles } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton.styled";

export const SkeletonImage = styled.svg`
  ${({ theme }) => getAnimationStyles(theme)};
  flex: 1 1 0;
  margin-top: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid ${() => color("bg-medium")};
`;
