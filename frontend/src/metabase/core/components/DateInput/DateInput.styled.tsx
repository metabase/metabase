import styled from "@emotion/styled";
import { color, darken } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export interface InputRootProps {
  readOnly?: boolean;
  error?: boolean;
  fullWidth?: boolean;
}

export const InputRoot = styled.div<InputRootProps>`
  display: inline-flex;
  align-items: center;
  width: ${props => (props.fullWidth ? "100%" : "")};
  border: 1px solid
    ${props => (props.error ? color("error") : darken("border", 0.1))};
  border-radius: 4px;
  background-color: ${props =>
    props.readOnly ? color("bg-light") : color("bg-white")};

  &:focus-within {
    border-color: ${color("brand")};
    transition: border 300ms ease-in-out;
  }
`;

export const InputIconButton = styled(IconButtonWrapper)`
  margin: 0 0.75rem;
`;

export const CalendarFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 0.75rem;
`;
