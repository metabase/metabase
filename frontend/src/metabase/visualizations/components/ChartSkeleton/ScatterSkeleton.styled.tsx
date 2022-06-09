import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  ${animationStyles};
  height: 100%;
  padding: 1rem;
  border-left: 1px solid ${color("bg-medium")};
  border-bottom: 1px solid ${color("bg-medium")};
`;

export const SkeletonImage = styled.svg`
  color: ${color("bg-medium")};
  width: 100%;
  height: 100%;
`;
