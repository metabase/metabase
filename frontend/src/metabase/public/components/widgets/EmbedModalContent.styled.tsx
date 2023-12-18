import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { ModalHeader } from "metabase/components/ModalContent";

export const EmbedModalHeader = styled(ModalHeader)`
  padding: 1.5rem 2rem;

  border-bottom: 1px solid ${color("border")};
`;
