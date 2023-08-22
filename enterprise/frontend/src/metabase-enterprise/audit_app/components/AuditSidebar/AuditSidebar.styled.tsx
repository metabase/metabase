import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";

interface SidebarItemRootProps {
  isDisabled?: boolean;
}

export const SidebarItemRoot = styled.div<SidebarItemRootProps>`
  margin: 1rem 0;
  cursor: pointer;
  pointer-events: ${props => props.isDisabled && "none"};
  opacity: ${props => props.isDisabled && "0.4"};

  &:hover {
    color: ${color("brand")};
  }
`;

export const SidebarItemLink = styled(Link)`
  text-decoration: none;

  &.active {
    color: ${color("brand")};
  }
`;
