// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const ObjectDetailHeaderWrapper = styled.div`
  flex-shrink: 0;
  display: flex;
  position: relative;
  border-bottom: 1px solid var(--mb-color-border);
`;

export const ObjectIdLabel = styled.span`
  color: var(--mb-color-text-secondary);
  margin-inline-start: 0.5rem;
`;

export const CloseButton = styled.div`
  display: flex;
  margin-inline-start: 1rem;
  padding-inline-start: 1rem;
  border-inline-start: 1px solid var(--mb-color-border);
`;
