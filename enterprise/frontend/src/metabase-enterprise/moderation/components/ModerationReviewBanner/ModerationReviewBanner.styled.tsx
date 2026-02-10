import styled from "@emotion/styled";

export const Container = styled.div`
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: start;
  column-gap: 0.5rem;
  border-radius: 8px;
`;

export const TextContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const Text = styled.span`
  font-size: 0.875rem;
  line-height: 1rem;
  margin-bottom: 0.25rem;
  font-weight: 700;
`;

export const Time = styled.time`
  color: var(--mb-color-text-secondary);
  font-size: 0.766rem;
  line-height: 1.25rem;
`;
