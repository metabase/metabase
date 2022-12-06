import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  height: 60vh;
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 1.5rem 2rem;
`;

export const ModalTitle = styled.div`
  flex: 1 1 auto;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const ModalBody = styled.div`
  display: flex;
  flex: 1;

  padding: 0 1rem 0 1rem;

  overflow-y: scroll;
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: space-between;

  padding: 1.5rem 2rem;

  border-top: 1px solid ${color("border")};
`;

export const ModalFooterContent = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const ErrorMessage = styled.span`
  color: ${color("error")};
`;
