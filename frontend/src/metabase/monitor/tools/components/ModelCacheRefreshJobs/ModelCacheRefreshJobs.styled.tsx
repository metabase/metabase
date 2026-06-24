// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const ErrorBox = styled.div`
  padding: 0.5rem 1rem;
  border-radius: 4px;
  color: var(--mb-color-text-primary);
  background-color: var(--mb-color-background-secondary);
  font-family: Monaco, monospace;
  font-weight: 400;
  font-size: 12px;
  line-height: 20px;
`;

export const IconButtonContainer = styled.button`
  cursor: pointer;

  .Icon {
    color: var(--mb-color-text-tertiary);
  }

  &:hover {
    .Icon {
      color: var(--mb-color-text-primary);
    }
  }
`;

export const PaginationControlsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  margin: 1.5rem 0;
`;
