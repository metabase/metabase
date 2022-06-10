import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Ellipsified from "metabase/core/components/Ellipsified";

export const SkeletonRoot = styled.div`
  display: flex;
  margin-bottom: 1rem;
`;

export const SkeletonTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-weight: bold;
  overflow: hidden;
`;
