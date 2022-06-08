import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles, positionStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  ${positionStyles};
  ${animationStyles};
  display: flex;
  justify-content: space-between;
`;

export const SkeletonColumn = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

export const SkeletonCell = styled.div`
  background-color: ${color("bg-medium")};
`;
