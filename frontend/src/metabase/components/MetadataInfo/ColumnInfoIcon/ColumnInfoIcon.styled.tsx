import styled from "@emotion/styled";
import { Icon } from "metabase/ui";

export const HoverParent = styled.div``;

export const PopoverHoverTarget = styled(Icon)<{ hasDescription: boolean }>`
  padding: 0.7em 0.65em;
  opacity: 0;

  ${HoverParent}:hover & {
    opacity: ${props => (props.hasDescription ? 0.6 : 0.3)};

    &[aria-expanded="true"] {
      opacity: 1;
    }
  }
`;
