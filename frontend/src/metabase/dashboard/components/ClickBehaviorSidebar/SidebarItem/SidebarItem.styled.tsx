import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color, darken } from "metabase/lib/colors";

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

export const Content = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
`;

export const Name = styled.h4``;

export const IconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  margin-right: 10px;
  border: 1px solid #f2f2f2;
  border-radius: 8px;
`;

export const CloseIconContainer = styled.span`
  display: flex;
  align-items: center;
  margin-left: auto;
  padding: 1rem;
  border-left: 1px solid ${darken("brand", 0.2)};
`;
