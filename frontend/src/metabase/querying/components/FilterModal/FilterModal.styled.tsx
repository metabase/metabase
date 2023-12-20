import styled from "@emotion/styled";
import type { BoxProps } from "metabase/ui";
import { Box, Flex, Modal, Tabs } from "metabase/ui";
import { color } from "metabase/lib/colors";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const TabPanelRoot = styled(Tabs.Panel)`
  overflow-y: auto;
`;

interface ColumnItemRootProps extends BoxProps {
  component?: string;
}

export const TabPanelItem = styled(Box)<ColumnItemRootProps>`
  border-bottom: 1px solid ${color("border")};

  &:last-of-type {
    border-bottom: none;
  }

  &:hover,
  :focus-within {
    background-color: ${color("bg-light")};
  }
`;

export const ModalHeader = styled(Modal.Header)`
  border-bottom: 1px solid ${color("border")};
`;

export const ModalBody = styled(Modal.Body)`
  height: calc(90vh - 10rem);

  ${breakpointMaxSmall} {
    height: calc(98vh - 10rem);
  }
`;

export const ModalFooter = styled(Flex)`
  border-top: 1px solid ${color("border")};
`;
