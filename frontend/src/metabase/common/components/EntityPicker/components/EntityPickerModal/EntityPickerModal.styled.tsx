import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Modal, Flex } from "metabase/ui";

export const ModalContent = styled(Modal.Content)`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
`;

export const ModalBody = styled(Modal.Body)`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

export const GrowFlex = styled(Flex)`
  flex-grow: 1;
`;

export const SinglePickerView = styled.div`
  border-top: 1px solid ${color("border")};
  flex-grow: 1;
  height: 0;
`;
