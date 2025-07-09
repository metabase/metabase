// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const QuestionsPageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 2rem;
  background-color: var(--mb-color-bg-white);
`;

export const QuestionsPageContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  width: 100%;

  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: var(--mb-color-text-dark);
    margin-bottom: 1rem;
  }

  p {
    font-size: 1rem;
    color: var(--mb-color-text-medium);
    margin-bottom: 1rem;
    line-height: 1.5;
  }
`;
