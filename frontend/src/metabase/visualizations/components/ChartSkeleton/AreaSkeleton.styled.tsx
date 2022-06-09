import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export const SkeletonContent = styled.div`
  ${animationStyles};
  flex: 1 1 0;
  padding-top: 2.375rem;
  padding-bottom: 0.125rem;
  border-bottom: 1px solid ${color("bg-medium")};
`;

export const SkeletonImage = styled.svg`
  color: ${color("bg-medium")};
  width: 100%;
  height: 100%;
`;
