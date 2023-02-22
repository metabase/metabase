import { css } from "@emotion/react";

export const shrinkOrExpandDuration = ".3s";

export const shrinkOrExpandOnClick = css`
  @keyframes expand {
    50% {
      transform: scale(1.3);
    }
  }

  @keyframes shrink {
    50% {
      transform: scale(0.8);
    }
  }
`;
