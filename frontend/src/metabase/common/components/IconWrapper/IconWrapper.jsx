// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const IconWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: ${({ borderRadius = 6 }) => borderRadius};
`;
