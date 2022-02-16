import styled from "@emotion/styled";

export interface InputRootProps {
  fullWidth?: boolean;
}

export const InputRoot = styled.div<InputRootProps>`
  display: inline-block;
  width: ${props => (props.fullWidth ? "100%" : "")};
`;
