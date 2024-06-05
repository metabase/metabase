import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/ui";
import { animationStyles } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton.styled";

import type { SkeletonCaptionSize } from "./types";

export const SkeletonCaptionRoot = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
`;

export interface SkeletonTitleProps {
  size: SkeletonCaptionSize;
}

export const SkeletonCaptionTitle = styled(Ellipsified)<SkeletonTitleProps>`
  color: var(--mb-color-text-dark);
  font-size: ${props => (props.size === "large" ? "1rem" : "")};
  line-height: ${props => (props.size === "large" ? "1.375rem" : "")};
  font-weight: bold;
  overflow: hidden;
`;

export const SkeletonPlaceholder = styled.div`
  ${animationStyles};
  width: 40%;
  height: 1.0625rem;
  border-radius: 1rem;
  background-color: var(--mb-color-bg-medium);
`;

export const SkeletonCaptionDescription = styled(Icon)`
  color: var(--mb-color-text-medium);
  margin-left: 0.5rem;
  visibility: hidden;
`;

export const SkeletonCaptionHeaderRight = styled.div`
  display: flex;
  align-items: center;
`;
