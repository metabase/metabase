import styled from "@emotion/styled";
import type { Theme } from "@emotion/react";
import { css } from "@emotion/react";
import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker/QueryColumnPicker";
import { alpha, lighten } from "metabase/lib/colors";
import { color } from "metabase/ui/utils/colors";

const noColumnStyle = ({
  isOpen = false,
  theme,
}: {
  isOpen?: boolean;
  theme: Theme;
}) => css`
  min-height: 34px;
  padding: 8px 20px;
  color: ${alpha(theme.fn.themeColor("brand"), 0.45)};
  border: 2px solid
    ${isOpen
      ? theme.fn.themeColor("brand")
      : alpha(theme.fn.themeColor("brand"), 0.45)};
  border-radius: 4px;

  &:hover,
  &:focus {
    border-color: ${theme.fn.themeColor("brand")};
  }
`;

const hasColumnStyle = ({
  isOpen = false,
  theme,
}: {
  isOpen?: boolean;
  theme: Theme;
}) => css`
  min-height: 39px;
  padding: 6px 16px 6px 10px;
  border-radius: 6px;

  background-color: ${isOpen
    ? lighten(theme.fn.themeColor("brand"), 0.1)
    : theme.fn.themeColor("brand")};

  &:hover,
  &:focus {
    background-color: ${lighten(theme.fn.themeColor("brand"), 0.1)};
  }
`;

export const JoinConditionCellItem = styled.button<{
  hasColumnSelected: boolean;
  isOpen?: boolean;
  readOnly?: boolean;
}>`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;

  ${props =>
    props.hasColumnSelected ? hasColumnStyle(props) : noColumnStyle(props)};

  cursor: ${props => (props.readOnly ? "default" : "pointer")};
  transition: background 300ms linear, border 300ms linear, color 300ms linear;
`;

export const StyledQueryColumnPicker = styled(QueryColumnPicker)`
  color: ${color("brand")};
`;
