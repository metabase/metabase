import styled from "@emotion/styled";

interface ColumnGridProps {
  rows: number;
}

export const ColumnGrid = styled.div<ColumnGridProps>`
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: ${({ rows }) => `repeat(${rows}, 1fr)`};
  gap: ${({ theme }) => theme.spacing.md};
`;
