import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
`;

export const SkeletonTopImage = styled.svg`
  ${animationStyles};
  color: ${color("bg-medium")};
  height: 2rem;
  margin-bottom: 1.25rem;
`;

export const SkeletonBottomImage = styled.svg`
  ${animationStyles};
  color: ${color("bg-medium")};
  height: 0.5rem;
  margin-top: 1rem;
`;
