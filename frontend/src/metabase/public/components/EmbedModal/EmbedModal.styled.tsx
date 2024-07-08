import styled from "@emotion/styled";

import { ModalHeader } from "metabase/components/ModalContent";

export const EmbedModalHeader = styled(ModalHeader)`
  padding: 1.5rem 2rem;
  color: ${({ theme }) => theme.fn.themeColor("text-medium")};
  border-bottom: 1px solid ${({ theme }) => theme.fn.themeColor("border")};
`;
