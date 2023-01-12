import styled from "@emotion/styled";

export const ActionsHeader = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export const ActionList = styled.ul`
  margin-top: 1rem;

  li:not(:first-of-type) {
    margin-top: 1rem;
  }
`;
