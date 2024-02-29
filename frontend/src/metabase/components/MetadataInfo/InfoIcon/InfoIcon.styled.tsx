import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const PopoverHoverTarget = styled(Icon)<{ hasDescription: boolean }>`
  padding: 0.7em 0.65em;
  visibility: hidden;
  flex-shrink: 0;
  opacity: ${props => (props.hasDescription ? 0.6 : 0.3)};

  &[aria-expanded="true"] {
    opacity: 1;
  }
`;

export const HoverParent = styled.div`
  &:hover ${PopoverHoverTarget} {
    visibility: visible;
  }
`;
