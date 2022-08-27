import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

const disabledStyle = css`
  pointer-events: none;
  opacity: 0.4;
`;

export const sidebarItemPaddingStyle = css`
  padding: 8px 12px;
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

  ${({ disabled }) => disabled && disabledStyle}

  ${({ padded = true }) => padded && sidebarItemPaddingStyle}

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
