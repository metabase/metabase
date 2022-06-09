import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { animationStyles, positionStyles } from "./ChartSkeleton.styled";

export const SkeletonRoot = styled.div`
  ${positionStyles};
  ${animationStyles};
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  border-left: 1px solid ${color("bg-medium")};
  border-bottom: 1px solid ${color("bg-medium")};
`;

export const SkeletonCircle = styled.div`
  position: absolute;
  border-radius: 10rem;
  background-color: ${color("bg-medium")};
  transform: translate(-50%, -50%);
`;
