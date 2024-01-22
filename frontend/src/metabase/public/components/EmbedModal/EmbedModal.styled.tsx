import styled from "@emotion/styled";
import {
  ModalContentActionIcon,
  ModalHeader,
} from "metabase/components/ModalContent";

export const EmbedModalHeader = styled(ModalHeader)`
  padding: 1.5rem 2rem;

  color: ${({ theme }) => theme.fn.themeColor("text-medium")};

  border-bottom: 1px solid ${({ theme }) => theme.fn.themeColor("border")};
`;

export const EmbedModalHeaderBackIcon = styled(ModalContentActionIcon)`
  margin: -0.5rem 0 -0.5rem -0.5rem;
`;
