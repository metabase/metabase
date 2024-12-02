import styled from "@emotion/styled";

import { breakpointMaxSmall } from "metabase/styled-components/theme";
import { Flex, Modal } from "metabase/ui";

export const ModalHeader = styled(Modal.Header)`
  flex: 0 0 auto;
  border-bottom: 1px solid var(--mb-color-border);
`;

export const ModalContent = styled(Modal.Content)`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
`;

export const ModalBody = styled(Modal.Body)`
  flex: 1;
  height: calc(90vh - 10rem);
  overflow: auto;

  ${breakpointMaxSmall} {
    height: calc(98vh - 10rem);
  }
`;

export const ModalFooter = styled(Flex)`
  flex: 0 0 auto;
  border-top: 1px solid var(--mb-color-border);
`;
