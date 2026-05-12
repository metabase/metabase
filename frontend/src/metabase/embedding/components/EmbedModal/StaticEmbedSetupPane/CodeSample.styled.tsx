// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const CopyButtonContainer = styled.div`
  position: absolute;
  top: 0;
  inset-inline-end: 0;
  cursor: pointer;
  z-index: 2;

  &:hover {
    color: var(--mb-color-brand);
  }
`;
