import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import TextArea from "metabase/core/components/TextArea";

export const ModalLayout = styled.div`
  display: flex;
  gap: 2rem;
`;

export const ModalPane = styled.div`
  flex: 0 1 auto;
`;

export const ModalMain = styled.div`
  flex: 1 1 auto;
`;

export const ModalSection = styled.div`
  margin-bottom: 1rem;
`;

export const ModalLabel = styled.label`
  display: block;
  margin-bottom: 0.75rem;
  color: ${color("text-medium")};
  font-size: 0.75rem;
  font-weight: bold;
  line-height: 1rem;
`;

export const ModalTextArea = styled(TextArea)`
  min-height: 10rem;
  resize: vertical;
`;
