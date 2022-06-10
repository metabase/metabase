import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/core/components/Ellipsified";

export const SkeletonRoot = styled.div`
  display: flex;
`;

export const SkeletonTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-weight: bold;
  overflow: hidden;
`;

export const SkeletonDescription = styled(Icon)`
  color: ${color("text-medium")};
  margin-left: 0.5rem;
  visibility: hidden;
`;
