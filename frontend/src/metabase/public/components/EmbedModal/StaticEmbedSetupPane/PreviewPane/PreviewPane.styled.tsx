import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { getCheckerBoardDataUri } from "./utils";

export const PreviewPaneContainer = styled.div<{
  isTransparent?: boolean;
  hidden?: boolean;
}>`
  width: 100%;
  min-height: 17.5rem;

  ${({ hidden }) =>
    hidden &&
    css`
      visibility: hidden;
      position: absolute;
    `}

  ${({ isTransparent }) =>
    isTransparent &&
    css`
      background-image: url("${getCheckerBoardDataUri()}");
      border-radius: var(--mb-default-border-radius);
    `};
`;
