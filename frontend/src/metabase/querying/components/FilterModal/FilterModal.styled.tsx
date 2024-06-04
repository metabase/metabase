import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMaxSmall } from "metabase/styled-components/theme";
import type { BoxProps } from "metabase/ui";
import { Box, Flex, Modal, Tabs } from "metabase/ui";

export const TabPanelRoot = styled(Tabs.Panel)`
  overflow-y: auto;
`;

interface ColumnItemRootProps extends BoxProps {
  component?: string;
}

export const TabPanelItem = styled(Box)<ColumnItemRootProps>`
  border-bottom: 1px solid ${color("border")};
  padding: 1rem 2rem;
  padding-left: 0;

  &:last-of-type {
    border-bottom: none;
  }

  &:hover,
  :focus-within {
    background-color: var(--mb-color-bg-light);
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

export const TabsListSidebar = styled(Tabs.List)`
  overflow-y: auto;
  flex-wrap: nowrap;
`;
