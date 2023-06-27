import { styled } from "metabase/ui/utils";

export const PreviewPaneContainer = styled.div<{ isTransparent?: boolean }>`
  ${({ isTransparent }) =>
    isTransparent &&
    `background-image: url("app/img/pattern_checkerboard.svg")`};
`;
