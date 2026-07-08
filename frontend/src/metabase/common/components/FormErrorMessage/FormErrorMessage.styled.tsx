// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

interface ErrorMessageRootProps {
  inline?: boolean;
}

export const ErrorMessageRoot = styled.div<ErrorMessageRootProps>`
  color: var(--mb-color-feedback-negative);
  margin-top: ${(props) => !props.inline && "1rem"};
`;
