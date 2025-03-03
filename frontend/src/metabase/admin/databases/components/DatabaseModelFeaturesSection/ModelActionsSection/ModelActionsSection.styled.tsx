// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const ToggleContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

export const Label = styled.label`
  width: 100%;
  cursor: pointer;
  color: var(--mb-color-text-medium);
  font-weight: 700;
`;

export const Description = styled.p`
  color: var(--mb-color-text-medium);
  line-height: 1.4;
`;

export const Error = styled(Description)`
  color: var(--mb-color-error);
  border-left: 3px solid var(--mb-color-error);
  padding-left: 12px;
`;
