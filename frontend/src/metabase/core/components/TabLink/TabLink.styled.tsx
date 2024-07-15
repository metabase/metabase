import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

export interface TabLinkProps {
  isSelected?: boolean;
}

export const TabLabel = styled.div`
  width: 100%;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const TabLinkRoot = styled(Link)<TabLinkProps>`
  padding: 1rem 0;
  color: ${props => (props.isSelected ? color("brand") : color("text-dark"))};
  font-size: 0.875rem;
  font-weight: 700;
  border-bottom: 3px solid
    ${props => (props.isSelected ? color("brand") : "transparent")};
`;
