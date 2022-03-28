import styled from "@emotion/styled";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 573px;
  max-height: 90vh;
`;

export interface ModalBodyProps {
  isTopAligned?: boolean;
}

export const ModalBody = styled.div<ModalBodyProps>`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  justify-content: ${props => (props.isTopAligned ? "" : "center")};
  margin: 1rem 0 0;
  padding: 1rem 2rem 2rem;
  overflow-y: auto;
`;
