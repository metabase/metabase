import { css, keyframes } from "@emotion/react";

import { color } from "metabase/lib/colors";

export const fadingKeyframes = keyframes`
  0% {
    opacity: 0.5;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0.5;
  }
`;
export const animationStyles = css`
  color: ${color("bg-medium")};
  animation: ${fadingKeyframes} 1.5s infinite;
`;
