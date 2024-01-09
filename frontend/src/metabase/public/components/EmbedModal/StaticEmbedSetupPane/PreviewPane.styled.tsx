import styled from "@emotion/styled";

export const PreviewPaneContainer = styled.div<{ isTransparent?: boolean }>`
  width: 100%;
  min-height: 17.5rem;

  ${({ isTransparent }) =>
    isTransparent &&
    `background-image: url("app/img/pattern_checkerboard.svg")`};
`;
