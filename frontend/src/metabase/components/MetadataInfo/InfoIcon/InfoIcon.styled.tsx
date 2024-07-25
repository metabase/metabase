import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const PopoverHoverTarget = styled(Icon)<{ hasDescription: boolean }>`
  flex-shrink: 0;
  display: none;
  width: 1em;
  height: 1em;

  [aria-expanded="true"] & {
    display: block;
  }
`;

export const PopoverDefaultIcon = styled(Icon)`
  display: block;
  width: 1em;
  height: 1em;

  [aria-expanded="true"] & {
    display: none;
  }
`;

export const HoverParent = styled.div`
  &:hover ${PopoverHoverTarget} {
    display: block;
  }

  &:hover ${PopoverDefaultIcon} {
    display: none;
  }
`;

export const IconContainer = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  font-size: ${props => props.size || '14px'};
`;
