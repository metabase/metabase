import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

export const SkeletonImage = styled.svg`
  ${animationStyles};
  flex: 1 1 0;
  color: ${color("bg-medium")};
  padding-top: 2.375rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid ${color("bg-medium")};
`;
