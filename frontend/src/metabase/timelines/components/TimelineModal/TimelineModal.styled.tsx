import styled from "@emotion/styled";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 100vh;
`;

export const ModalToolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 1rem 2rem;
`;

export const ModalBody = styled.div`
  flex: 1 1 auto;
  padding: 0 2rem 2rem;
  overflow-y: auto;
`;
