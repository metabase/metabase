import { css, keyframes } from "@emotion/react";
import { color } from "metabase/lib/colors";
import { SharedChartSkeletonProps } from "../ChartSkeleton/types";

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

export const containerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export const animationStyles = ({ isStatic }: SharedChartSkeletonProps) => css`
  color: ${color("bg-medium")};
  ${isStatic
    ? null
    : css`
        animation: ${fadingKeyframes} 1.5s infinite;
      `};
`;
