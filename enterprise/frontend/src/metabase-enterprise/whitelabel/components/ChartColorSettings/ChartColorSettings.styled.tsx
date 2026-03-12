import styled from "@emotion/styled";

export const TableBody = styled.div`
  border: 1px solid var(--mb-color-border);
  border-bottom: 0;
  border-radius: 0.5rem 0.5rem 0 0;
`;

export const TableBodyRow = styled.div`
  display: flex;
  align-items: center;

  &:not(:first-of-type) {
    border-top: 1px solid var(--mb-color-border);
  }
`;

export const TableBodyCell = styled.div`
  flex: 1 1 auto;
  padding: 1rem 1.5rem;

  &:not(:first-of-type) {
    border-left: 1px solid var(--mb-color-border);
    background-color: var(--mb-color-background-secondary);
  }
`;

export const TableFooter = styled.div`
  padding: 1rem 1.5rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0 0 0.5rem 0.5rem;
`;
