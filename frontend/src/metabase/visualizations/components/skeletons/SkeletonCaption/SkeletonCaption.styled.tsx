import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/core/components/Ellipsified";
import { animationStyles } from "../Skeleton";

export const SkeletonRoot = styled.div`
  display: flex;
`;

export const SkeletonTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-weight: bold;
  overflow: hidden;
`;

export const SkeletonPlaceholder = styled.div`
  ${animationStyles};
  width: 40%;
  height: 1.0625rem;
  border-radius: 1rem;
  background-color: ${color("bg-medium")};
`;

export const SkeletonDescription = styled(Icon)`
  color: ${color("text-medium")};
  margin-left: 0.5rem;
  visibility: hidden;
`;
