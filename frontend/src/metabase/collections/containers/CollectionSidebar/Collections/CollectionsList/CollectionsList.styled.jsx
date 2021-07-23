import styled from "styled-components";
import { Box, Flex } from "grid-styled";

import { SIDEBAR_SPACER } from "metabase/collections/constants";
import { color } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Icon from "metabase/components/Icon";

export const ChildrenContainer = styled(Box)`
  margin-left: -${SIDEBAR_SPACER}px;
  padding-left: ${SIDEBAR_SPACER + 10}px;
`;

export const ExpandCollectionButton = styled(IconButtonWrapper)`
  align-items: center;
  color: ${color("brand")};
  cursor: pointer;
  left: -20px;
  position: absolute;
`;

export const InitialIcon = styled(Icon)`
  margin-right: 6px;
  opacity: 0.4;
`;

export const LabelContainer = styled(Flex)`
  position: relative;
`;
