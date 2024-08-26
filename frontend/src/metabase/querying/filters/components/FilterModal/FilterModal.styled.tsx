import styled from "@emotion/styled";

import { breakpointMaxSmall } from "metabase/styled-components/theme";
import { Flex, Modal } from "metabase/ui";

export const ModalHeader = styled(Modal.Header)`
  border-bottom: 1px solid var(--mb-color-border);
`;

export const ModalBody = styled(Modal.Body)`
  height: calc(90vh - 10rem);

  ${breakpointMaxSmall} {
    height: calc(98vh - 10rem);
  }
`;

export const ModalFooter = styled(Flex)`
  border-top: 1px solid var(--mb-color-border);
`;
