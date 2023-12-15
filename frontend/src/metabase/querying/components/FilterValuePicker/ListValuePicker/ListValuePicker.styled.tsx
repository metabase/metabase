import styled from "@emotion/styled";

interface ColumnGridProps {
  rows: number;
}

export const ColumnGrid = styled.div<ColumnGridProps>`
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: ${({ rows }) => rows};
  gap: ${({ theme }) => theme.spacing.md};
`;
