import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { Flex } from "metabase/ui";
import QueryColumnPicker from "metabase/common/components/QueryColumnPicker/QueryColumnPicker";
import { color, darken } from "metabase/lib/colors";

const noColumnStyle = css`
  height: 34px;
  padding: 8px 20px;
  border: 1px solid rgba(255, 255, 255, 0.51);
  border-radius: 4px;
`;

const hasColumnStyle = css`
  height: 39px;
  padding-right: 16px;
  padding-left: 10px;
  border-radius: 6px;
`;

export const JoinConditionCellItem = styled(Flex)<{
  hasColumnSelected: boolean;
  isOpen?: boolean;
  readOnly?: boolean;
}>`
  flex-direction: column;
  justify-content: center;
  gap: 2px;

  ${props => (props.hasColumnSelected ? hasColumnStyle : noColumnStyle)};

  cursor: ${props => (props.readOnly ? "default" : "pointer")};
  transition: background 300ms linear;

  background: ${props =>
    props.isOpen ? darken("brand", 0.15) : "transparent"};

  &:hover {
    background: ${darken("brand", 0.15)};
  }
`;

export const StyledQueryColumnPicker = styled(QueryColumnPicker)`
  color: ${color("brand")};
`;
