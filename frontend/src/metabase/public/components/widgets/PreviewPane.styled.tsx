import styled from "@emotion/styled";

export const PreviewPaneContainer = styled.div<{ isTransparent?: boolean }>`
  ${({ isTransparent }) =>
    isTransparent &&
    `background-image: url("app/img/pattern_checkerboard.svg")`};
`;
