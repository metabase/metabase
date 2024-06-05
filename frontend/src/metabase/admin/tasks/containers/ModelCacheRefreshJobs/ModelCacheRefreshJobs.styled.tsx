import styled from "@emotion/styled";

export const ErrorBox = styled.div`
  padding: 0.5rem 1rem;
  border-radius: 4px;

  color: var(--mb-color-text-dark);
  background-color: var(--mb-color-bg-light);

  font-family: Monaco, monospace;
  font-weight: 400;
  font-size: 12px;
  line-height: 20px;
`;

export const IconButtonContainer = styled.button`
  cursor: pointer;

  .Icon {
    color: var(--mb-color-text-light);
  }

  &:hover {
    .Icon {
      color: var(--mb-color-text-dark);
    }
  }
`;

export const PaginationControlsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  margin: 1.5rem 0;
`;
