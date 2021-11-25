import styled from "styled-components";

export const InputAdornmentRoot = styled.div`
  position: absolute;
  left: ${props => (props.left ? "0.75rem" : "")};
  right: ${props => (props.right ? "0.75rem" : "")};
`;
