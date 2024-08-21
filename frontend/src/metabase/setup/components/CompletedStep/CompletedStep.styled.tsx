import styled from "@emotion/styled";

export const StepRoot = styled.section`
  display: flex;
  flex-direction: column;
  padding: 2.5rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: var(--mb-color-bg-white);
  gap: 32px;
  margin-bottom: 1.75rem;
`;

export const StepTitle = styled.div`
  color: var(--mb-color-text-light);
  font-size: 2rem;
  font-weight: 700;
`;

export const StepBody = styled.div`
  padding: 24px;
  border: 1px solid var(--mb-color-border);
  border-radius: 4px;
`;

export const StepFooter = styled.div`
  display: flex;
  justify-content: flex-end;
`;
