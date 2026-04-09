// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const TokenFieldItem = styled.li<{
  isValid: boolean;
}>`
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;

  height: 46px;
  border-radius: 0.5rem;
  color: ${({ isValid }) =>
    isValid ? `var(--mb-color-text-primary-inverse)` : `var(--mb-color-error)`};

  background-color: var(--mb-color-brand);
`;

export const TokenFieldAddon = styled.a<{
  isValid: boolean;
}>`
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
  color: ${({ isValid }) => (isValid ? "" : `var(--mb-color-error)`)};

  &:hover {
    color: var(--mb-color-text-hover);
  }
`;
