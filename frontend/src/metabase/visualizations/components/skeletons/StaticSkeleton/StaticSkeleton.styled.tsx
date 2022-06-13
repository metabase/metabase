import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/core/components/Ellipsified";

export const SkeletonIcon = styled(Icon)`
  color: ${color("text-medium")};
  width: 1.5rem;
  height: 1.5rem;
  margin-bottom: 1rem;
`;

export const SkeletonTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-size: 1rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const SkeletonDescription = styled(Ellipsified)`
  color: ${color("text-medium")};
  margin-top: 0.25rem;
`;
