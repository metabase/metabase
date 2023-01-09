import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import TextArea from "metabase/core/components/TextArea";

export const ModalBody = styled.div`
  display: flex;
  gap: 2rem;
  height: 50vh;
`;

export const ModalPane = styled.div`
  flex: 1;
`;

export const ModalMain = styled.div`
  display: flex;
  flex: 2;
  flex-direction: row;
`;

export const ModalSection = styled.div`
  margin-bottom: 1rem;
`;

export const ModalLabel = styled.label`
  display: block;
  color: ${color("text-medium")};
  margin-bottom: 0.5rem;
  font-weight: bold;
`;

export const ModalTextArea = styled(TextArea)`
  display: block;
  resize: none;
`;

export const ModalHelpMessage = styled.div`
  color: ${color("text-medium")};
  margin-top: 0.25rem;
  margin-left: 1.25rem;
`;

export const ModalErrorMessage = styled.div`
  color: ${color("text-medium")};
  padding: 1rem;
  border: 1px solid ${color("error")};
  border-radius: 0.5rem;
`;
