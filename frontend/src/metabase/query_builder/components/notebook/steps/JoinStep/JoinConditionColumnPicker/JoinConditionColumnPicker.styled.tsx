import styled from "@emotion/styled";
import { css } from "@emotion/react";
import QueryColumnPicker from "metabase/common/components/QueryColumnPicker/QueryColumnPicker";
import { alpha, color, darken } from "metabase/lib/colors";

const noColumnStyle = css`
  min-height: 34px;
  padding: 8px 20px;
  border: 1px solid ${alpha(color("white"), 0.5)};
  border-radius: 4px;
`;

const hasColumnStyle = css`
  min-height: 39px;
  padding: 6px 16px 6px 10px;
  border-radius: 6px;
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

  ${props => (props.hasColumnSelected ? hasColumnStyle : noColumnStyle)};

  cursor: ${props => (props.readOnly ? "default" : "pointer")};
  transition: background 300ms linear;

  background: ${props =>
    props.isOpen ? darken("brand", 0.15) : "transparent"};

  &:hover,
  &:focus {
    background: ${darken("brand", 0.15)};
  }
`;

export const StyledQueryColumnPicker = styled(QueryColumnPicker)`
  color: ${color("brand")};
`;
