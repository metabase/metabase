import styled from "@emotion/styled";

export interface ErrorMessageRootProps {
  inline?: boolean;
}

export const ErrorMessageRoot = styled.div<ErrorMessageRootProps>`
  color: var(--mb-color-error);
  margin-top: ${props => !props.inline && "1rem"};
`;
