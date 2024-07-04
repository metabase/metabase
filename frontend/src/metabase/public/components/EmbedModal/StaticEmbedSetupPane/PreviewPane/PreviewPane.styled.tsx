import { css, type SerializedStyles } from "@emotion/react";
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
      .with(
        "checkerboard-light",
        () =>
          css`
            background-image: url("${getCheckerBoardDataUri("light")}");
            border-radius: var(--mb-default-border-radius);
          `,
      )
      .with(
        "checkerboard-dark",
        () =>
          css`
            background-image: url("${getCheckerBoardDataUri("dark")}");
            border-radius: var(--mb-default-border-radius);
          `,
      )
      .with("no-background", () => null)
      .exhaustive()};
`;
