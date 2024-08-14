import styled from "@emotion/styled";

import { HoverCard } from "metabase/ui";

export const WidthBound = styled.div<{ width?: number }>`
  font-size: 14px;
  width: ${props => props.width ?? 300}px;
`;

export const Dropdown = styled(HoverCard.Dropdown)`
  overflow: visible;
`;

export const HackyInvisibleTargetFiller = styled.div`
  position: absolute;
  width: 100%;
  top: -10px;
  min-height: 5px;
  z-index: -1;
`;
