import { css, keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import SkeletonCaption from "metabase/visualizations/components/skeletons/SkeletonCaption";

export const VisualizationSkeletonCaption = styled(SkeletonCaption)`
  justify-content: space-between;
`;

export const fadingKeyframes = keyframes`
  0% {
    opacity: 0.5;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0.5;
  }
`;

export const animationStyles = css`
  color: ${color("bg-medium")};
  animation: ${fadingKeyframes} 1.5s infinite;
`;
