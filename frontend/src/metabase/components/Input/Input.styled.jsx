import styled from "styled-components";
import { color, darken } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const InputRoot = styled.div`
  display: inline-flex;
  align-items: center;
  position: relative;
  width: ${props => (props.fullWidth ? "100%" : "")};
`;

export const InputField = styled.input`
  font-family: inherit;
  font-weight: 700;
  font-size: 1rem;
  color: ${color("text-dark")};
  background-color: ${color("bg-white")};
  width: ${props => (props.fullWidth ? "100%" : "")};
  padding: 0.75rem;
  border: 1px solid
    ${props => (props.error ? color("error") : darken("border", 0.1))};
  border-radius: 4px;
  outline: none;

  &:focus {
    border-color: ${color("brand")};
    transition: border 300ms ease-in-out;
  }
`;

export const InputHelpButton = styled(IconButtonWrapper)`
  position: absolute;
  right: 0.75rem;
  color: ${color("text-light")};
`;
