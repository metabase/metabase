import styled from "@emotion/styled";

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const EmptyStateTitle = styled.div`
  color: var(--mb-color-text-dark);
  font-size: 1.5rem;
  font-weight: bold;
  line-height: 2rem;
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
`;

export const EmptyStateIconForeground = styled.path`
  fill: var(--mb-color-bg-light);
  stroke: var(--mb-color-brand);
`;

export const EmptyStateIconBackground = styled.path`
  fill: var(--mb-color-brand-light);
  stroke: var(--mb-color-brand);
`;
