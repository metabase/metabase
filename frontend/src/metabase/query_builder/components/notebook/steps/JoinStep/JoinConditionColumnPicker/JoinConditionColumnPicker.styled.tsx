import { css, type Theme } from "@emotion/react";
import styled from "@emotion/styled";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker/QueryColumnPicker";
import { alpha, color, lighten } from "metabase/lib/colors";

const getNoColumnStyle = (theme: Theme, isOpen = false) => css`
  min-height: 34px;
  padding: 8px 20px;
  color: ${alpha(theme.fn.themeColor("brand"), 0.45)};
  border: 2px solid ${isOpen ? "var(--mb-color-brand)" : alpha("brand", 0.45)};
  border-radius: 4px;

  &:hover,
  &:focus {
    border-color: var(--mb-color-brand);
  }
`;

const getHasColumnStyle = (theme: Theme, isOpen = false) => css`
  min-height: 39px;
  padding: 6px 16px 6px 10px;
  border-radius: 6px;

  background-color: ${isOpen ? lighten("brand", 0.1) : color("brand")};

  &:hover,
  &:focus {
    background-color: ${lighten(theme.fn.themeColor("brand"), 0.1)};
  }
`;

export const JoinCellItem = styled.button<{
  isColumnSelected: boolean;
  isOpen?: boolean;
  isReadOnly?: boolean;
}>`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;

  ${({ isColumnSelected, isOpen, theme }) =>
    isColumnSelected
      ? getHasColumnStyle(theme, isOpen)
      : getNoColumnStyle(theme, isOpen)};

  cursor: ${props => (props.isReadOnly ? "default" : "pointer")};
  transition: background 300ms linear, border 300ms linear, color 300ms linear;
`;

export const JoinColumnPicker = styled(QueryColumnPicker)`
  color: var(--mb-color-brand);
`;
