// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const Label = styled.label`
  width: 100%;
  cursor: pointer;
  color: var(--mb-color-text-primary);
  font-weight: 700;
  line-height: 1;
`;

export const Description = styled.p`
  color: var(--mb-color-text-secondary);
  line-height: 1.4;
  margin-top: 0;
`;

export const Error = styled(Description)`
  color: var(--mb-color-error);
  border-left: 3px solid var(--mb-color-error);
  padding-left: 12px;
`;
