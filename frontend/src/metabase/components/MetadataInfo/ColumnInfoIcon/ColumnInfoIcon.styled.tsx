import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { Icon } from "metabase/ui";

export const PopoverHoverTarget = styled(Icon)`
  padding: 0.7em 0.65em;
  opacity: 0;
`;

export const ActiveStyles = css`
  ${PopoverHoverTarget} {
    opacity: 0.6;
  }

  ${PopoverHoverTarget}[data-no-description="true"] {
    opacity: 0.3;
  }

  ${PopoverHoverTarget}[aria-expanded="true"] {
    opacity: 1;
  }
`;
