import styled from "@emotion/styled";
import SelectList from "metabase/components/SelectList";
import { color, darken } from "metabase/lib/colors";

export const OperatorPickerButton = styled.button<{ isOpen?: boolean }>`
  background-color: ${props =>
    props.isOpen ? darken("brand", 0.15) : "transparent"};
  color: ${color("white")};
  font-size: 16px;

  padding: 4px 8px;
  border-radius: 4px;

  cursor: ${props => (props.disabled ? "default" : "pointer")};

  transition: background 300ms linear;

  &:hover,
  &:focus {
    background: ${darken("brand", 0.15)};
  }
`;

export const OperatorList = styled(SelectList)`
  width: 80px;
  padding: 0.5rem;
`;

export const OperatorListItem = styled(SelectList.Item)`
  padding: 0.5rem 0.5rem 0.5rem 1rem;
`;
