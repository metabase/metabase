import styled from "@emotion/styled";

export const QuestionListItemRoot = styled.li`
  align-items: center;
  display: flex;
  margin: 0;
  min-height: 36px;
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;

  &:first-child {
    padding-top: 0.5rem;
  }

  &:last-child {
    padding-bottom: 0.5rem;
  }
`;

export const CheckboxContainer = styled.div`
  display: inline-block;
  padding: 0 0.5rem 0 0;
  max-width: 100%;
  width: 100%;
`;
