import styled from "@emotion/styled";
import { color, darken } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export interface InputRootProps {
  readOnly?: boolean;
  fullWidth?: boolean;
}

export const InputRoot = styled.div<InputRootProps>`
  display: inline-flex;
  align-items: center;
  width: ${props => (props.fullWidth ? "100%" : "")};
  border: 1px solid ${darken("border", 0.1)};
  border-radius: 4px;
  background-color: ${props => color(props.readOnly ? "bg-light" : "bg-white")};
`;

export const InputIcon = styled(Icon)`
  cursor: pointer;
  margin: 0 0.5rem;
`;
