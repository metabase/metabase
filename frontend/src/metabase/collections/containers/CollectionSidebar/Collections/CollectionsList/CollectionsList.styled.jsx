import styled from "styled-components";
import { Flex } from "grid-styled";

import { color } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Icon from "metabase/components/Icon";

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

export const ItemContainer = styled(Flex)`
  position: relative;
`;
