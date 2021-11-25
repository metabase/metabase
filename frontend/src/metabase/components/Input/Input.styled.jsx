import styled from "styled-components";
import { color, darken } from "metabase/lib/colors";

export const InputField = styled.input`
  font-family: inherit;
  font-weight: 700;
  font-size: 1rem;
  color: ${props => color(props.hasError ? "error" : "text-dark")};
  background-color: ${color("bg-white")};
  width: ${props => (props.fullWidth ? "100%" : "")};
  padding: 0.75rem;
  border: 1px solid ${darken("border", 0.1)};
  border-radius: 4px;
  outline: none;

  &:focus {
    border-color: ${color("brand")};
    transition: border 300ms ease-in-out;
  }
`;
