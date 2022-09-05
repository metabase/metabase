import styled from "@emotion/styled";

export const ActionList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 1.5rem;
`;

export const ActionListItem = styled.div`
  &:not(:last-child) {
    margin-bottom: 1rem;
  }
`;
