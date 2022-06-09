import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.svg`
  ${animationStyles};
  color: ${color("bg-medium")};
  width: 100%;
  height: 100%;
`;
