import styled from "styled-components";

import { SIDEBAR_SPACER } from "metabase/collections/constants";
import { color } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Icon from "metabase/components/Icon";

export const ChildrenContainer = styled.div`
  box-sizing: border-box;
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

export const LabelContainer = styled.div`
  display: flex;
  position: relative;
`;
