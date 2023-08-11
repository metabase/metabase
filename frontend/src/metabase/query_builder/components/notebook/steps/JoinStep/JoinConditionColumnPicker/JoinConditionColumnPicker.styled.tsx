import styled from "@emotion/styled";
import { css } from "@emotion/react";
import QueryColumnPicker from "metabase/common/components/QueryColumnPicker/QueryColumnPicker";
import { alpha, color, lighten } from "metabase/lib/colors";

const noColumnStyle = (isOpen = false) => css`
  min-height: 34px;
  padding: 8px 20px;
  color: ${alpha("brand", 0.45)};
  border: 2px solid ${isOpen ? color("brand") : alpha("brand", 0.45)};
  border-radius: 4px;

  &:hover,
  &:focus {
    border-color: ${color("brand")};
  }
`;

const hasColumnStyle = (isOpen = false) => css`
  min-height: 39px;
  padding: 6px 16px 6px 10px;
  border-radius: 6px;

  background-color: ${isOpen ? lighten("brand", 0.1) : color("brand")};

  &:hover,
  &:focus {
    background-color: ${lighten("brand", 0.1)};
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
    props.hasColumnSelected
      ? hasColumnStyle(props.isOpen)
      : noColumnStyle(props.isOpen)};

  cursor: ${props => (props.readOnly ? "default" : "pointer")};
  transition: background 300ms linear, border 300ms linear, color 300ms linear;
`;

export const StyledQueryColumnPicker = styled(QueryColumnPicker)`
  color: ${color("brand")};
`;
