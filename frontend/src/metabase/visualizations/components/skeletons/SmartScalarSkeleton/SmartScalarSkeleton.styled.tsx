import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { containerStyles, animationStyles } from "../Skeleton";

export const SkeletonRoot = styled.div`
  ${containerStyles};
  justify-content: center;
  align-items: center;
`;

export const SkeletonTopImage = styled.svg`
  ${animationStyles};
  height: 2rem;
  margin-bottom: 1.25rem;
`;

export const SkeletonBottomImage = styled.svg`
  ${animationStyles};
  height: 0.5rem;
  margin-top: 1rem;
`;
