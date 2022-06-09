import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles, positionStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  ${positionStyles};
  ${animationStyles};
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

export const SkeletonColumn = styled.div`
  background-color: ${color("bg-medium")};
`;
