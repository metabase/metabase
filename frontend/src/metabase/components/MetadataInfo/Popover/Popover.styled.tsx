import styled from "@emotion/styled";

import { HoverCard } from "metabase/ui";

export const WidthBound = styled.div<{ width?: number }>`
  font-size: 14px;
  width: ${props => props.width ?? 300}px;
`;

export const Dropdown = styled(HoverCard.Dropdown)`
  overflow: visible;
`;

export const Target = styled.div`
  position: absolute;
  width: calc(100% + 20px);
  left: -10px;
  right: -10px;
  top: -10px;
  bottom: -10px;
  min-height: 5px;
  z-index: -1;
`;
