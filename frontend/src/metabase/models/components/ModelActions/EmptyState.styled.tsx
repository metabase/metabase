// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const EmptyStateContainer = styled.div`
  display: flex;
  height: 100%;
  gap: 0.5rem;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  margin: auto;
  max-width: 400px;
`;

export const EmptyStateTitle = styled.h4`
  font-size: 1rem;
  font-weight: 700;
  color: var(--mb-color-text-primary);
`;

export const EmptyStateMessage = styled.p`
  color: var(--mb-color-text-secondary);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.18rem;
  margin-top: 0.5rem;
`;

export const EmptyStateActionContainer = styled.div`
  margin-top: 1rem;
`;
