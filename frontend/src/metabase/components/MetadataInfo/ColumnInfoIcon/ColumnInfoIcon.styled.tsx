import styled from "@emotion/styled";
import { Icon } from "metabase/ui";

export const HoverParent = styled.div``;

export const PopoverHoverTarget = styled(Icon)`
  padding: 0.7em 0.65em;
  opacity: 0;

  ${HoverParent}:hover & {
    opacity: 0.6;

    &[data-no-description="true"] {
      opacity: 0.3;
    }

    &[aria-expanded="true"] {
      opacity: 1;
    }
  }
`;
