// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const InfoModalTitle = styled.h2`
  text-align: center;
  font-size: 1.375rem; /* 22px 🤦‍♀️ */
`;

export const InfoModalBody = styled.div`
  color: var(--mb-color-text-secondary);
`;

export const NewBadge = styled.div`
  padding: 5px 10px;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--mb-color-core-brand);
  background-color: var(--mb-color-background_surface-brand-subtle);
  margin: 0 auto;
  border-radius: 6px;
`;

export const InfoModalContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  justify-content: center;
`;
