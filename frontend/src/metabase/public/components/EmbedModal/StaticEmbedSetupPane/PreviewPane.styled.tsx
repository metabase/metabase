import styled from "@emotion/styled";

export const PreviewPaneContainer = styled.div<{ isTransparent?: boolean }>`
  width: 100%;
  min-height: 280px;

  ${({ isTransparent }) =>
    isTransparent &&
    `background-image: url("app/img/pattern_checkerboard.svg")`};
`;
