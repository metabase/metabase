import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { Icon } from "metabase/ui";

export const PopoverHoverTarget = styled(Icon)<{ hasInfo: boolean }>`
  padding: 0.7em 0.65em;
  opacity: 0;

  path {
    opacity: 0.6;
  }

  ${props =>
    !props.hasInfo &&
    css`
      path {
        opacity: 0.3;
      }
    }`}

  &[aria-expanded="true"] {
    path {
      opacity: 1;
    }
  }
`;
