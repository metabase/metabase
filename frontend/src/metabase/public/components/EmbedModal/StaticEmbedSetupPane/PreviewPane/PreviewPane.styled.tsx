import { type SerializedStyles, css } from "@emotion/react";
import styled from "@emotion/styled";
import { match } from "ts-pattern";

import type { PreviewBackgroundType } from "./PreviewPane";
import { getCheckerBoardDataUri } from "./utils";

export const PreviewPaneContainer = styled.div<{
  backgroundType: PreviewBackgroundType;
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

  ${({ backgroundType }) =>
    match(backgroundType)
      .returnType<SerializedStyles | null>()
      .with("checkerboard-light", () => {
        const dataUri = getCheckerBoardDataUri("checkerboard-light");
        return css`
          background-image: url("${dataUri}");
        `;
      })
      .with("checkerboard-dark", () => {
        const dataUri = getCheckerBoardDataUri("checkerboard-dark");
        return css`
          background-image: url("${dataUri}");
        `;
      })
      .with("no-background", () => null)
      .exhaustive()};
`;
