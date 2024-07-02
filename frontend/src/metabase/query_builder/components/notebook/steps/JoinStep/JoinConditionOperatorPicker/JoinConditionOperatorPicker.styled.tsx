import { css, type Theme } from "@emotion/react";
import styled from "@emotion/styled";

import SelectList from "metabase/components/SelectList";
import { color, lighten } from "metabase/lib/colors";

const getCompleteConditionStyle = (theme: Theme, isOpened = false) => css`
  color: var(--mb-color-text-white);
  background-color: ${isOpened ? lighten("brand", 0.1) : "transparent"};

  &:hover,
  &:focus {
    background-color: ${lighten(theme.fn.themeColor("brand"), 0.1)};
  }
`;

const getIncompleteConditionStyle = (isOpened = false) => css`
  color: var(--mb-color-brand);
  border: 2px solid ${isOpened ? color("brand") : "transparent"};

  &:hover,
  &:focus {
    border: 2px solid var(--mb-color-brand);
  }
`;

export const OperatorPickerButton = styled.button<{
  isOpened?: boolean;
  isConditionComplete: boolean;
}>`
  ${props =>
    props.isConditionComplete
      ? getCompleteConditionStyle(props.theme, props.isOpened)
      : getIncompleteConditionStyle(props.isOpened)}

  font-size: 16px;
  padding: 4px 8px;
  border-radius: 4px;

  cursor: ${props => (props.disabled ? "default" : "pointer")};
  transition: background 300ms linear, border 300ms linear, color 300ms linear;
`;

export const OperatorList = styled(SelectList)`
  width: 80px;
  padding: 0.5rem;
`;

export const OperatorListItem = styled(SelectList.Item)`
  padding: 0.5rem 0.5rem 0.5rem 1rem;
`;
