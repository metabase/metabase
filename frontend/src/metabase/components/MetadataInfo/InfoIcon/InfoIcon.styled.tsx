import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const PopoverHoverTarget = styled(Icon)<{ hasDescription: boolean }>`
  flex-shrink: 0;
  display: none;

  [aria-expanded="true"] & {
    display: block;
  }
`;

export const PopoverDefaultIcon = styled(Icon)`
  display: block;

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
