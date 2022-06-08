import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles, positionStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  ${positionStyles};
  ${animationStyles};
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

export const SkeletonRow = styled.div`
  height: 17%;
  background-color: ${color("bg-medium")};
`;
