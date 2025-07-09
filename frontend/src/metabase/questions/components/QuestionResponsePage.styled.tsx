// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const QuestionResponsePageContainer = styled.div`
  display: flex;
  height: 100vh;
  gap: 2rem;
  padding: 2rem;
  background-color: var(--mb-color-bg-white);
`;

export const QuestionResponseContent = styled.div`
  flex: 1;
  overflow-y: auto;
`;

export const QuestionResponseSidebar = styled.div`
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid var(--mb-color-border);
  padding-left: 1rem;
  overflow-y: auto;
  max-height: 100vh;
`;
