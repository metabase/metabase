import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface TabProps {
  isActive?: boolean;
}

export const TabRoot = styled.div<TabProps>`
  display: inline-flex;
  align-items: center;
  color: ${props => (props.isActive ? color("brand") : color("text-dark"))};
  padding-bottom: 0.75rem;
  border-bottom: 0.125rem solid
    ${props => (props.isActive ? color("brand") : "transparent")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const TabLabel = styled.span`
  font-size: 1rem;
  line-height: 1rem;
  font-weight: bold;
`;
