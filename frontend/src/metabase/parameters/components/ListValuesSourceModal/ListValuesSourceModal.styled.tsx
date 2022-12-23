import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import TextArea from "metabase/core/components/TextArea";

export const ModalMessage = styled.div`
  color: ${color("text-medium")};
  margin-bottom: 1rem;
`;

export const ModalTextArea = styled(TextArea)`
  resize: vertical;
`;
