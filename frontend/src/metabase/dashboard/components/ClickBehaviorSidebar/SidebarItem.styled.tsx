import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

const disabledCSS = css`
  pointer-events: none;
  opacity: 0.4;
`;

export const BaseSidebarItemRoot = styled.div<{
  disabled?: boolean;
  padded?: boolean;
}>`
  display: flex;
  align-items: center;

  overflow: hidden;

  border: 1px solid transparent;
  border-radius: 8px;

  cursor: pointer;

  ${({ disabled }) => disabled && disabledCSS}

  ${({ padded = true }) =>
    padded &&
    css`
      padding: 8px 12px;
    `}

  &:hover {
    border-color: ${color("brand")};
  }
`;

export const SelectableSidebarItemRoot = styled(BaseSidebarItemRoot)<{
  isSelected: boolean;
}>`
  background-color: ${props =>
    props.isSelected ? color("brand") : "transparent"};

  color: ${props => (props.isSelected ? color("white") : "inherit")};
`;
