import styled from "@emotion/styled";
import { css } from "@emotion/react";

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
    `background-image: url("app/img/pattern_checkerboard.svg")`};
`;
