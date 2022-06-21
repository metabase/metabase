import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { containerStyles, animationStyles } from "../Skeleton";

export const SkeletonRoot = styled.div`
  ${containerStyles};
`;

export const SkeletonImage = styled.svg`
  ${animationStyles};
  flex: 1 1 0;
  margin-top: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid ${color("bg-medium")};
`;
